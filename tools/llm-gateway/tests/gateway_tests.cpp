#include "gateway/gateway.hpp"
#include "gateway/model_filter.hpp"
#include "gateway/model_router.hpp"
#include <httplib.h>
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <map>
#include <thread>
using namespace std::chrono_literals;
namespace {
int failures=0;
#define CHECK(x) do{if(!(x)){std::cerr<<"FAIL "<<__FILE__<<":"<<__LINE__<<" " #x "\n";++failures;}}while(0)
class MockStore final:public gateway::ICredentialStore{public:std::map<std::string,std::string> values{{"CloudLLM\nllm_gateway|default","client-secret"},{"CloudLLM\nmock|default","upstream-secret"}};std::optional<gateway::Secret>get(std::string_view service,std::string_view username)override{auto i=values.find(std::string(service)+"\n"+std::string(username));if(i==values.end())return std::nullopt;return gateway::Secret(i->second);}};
gateway::Config config(){gateway::Config c;c.listen.port=19102;c.logging.file="gateway-tests.log";c.cors.enabled=true;c.cors.allowed_origins={"http://127.0.0.1:3000"};gateway::ProviderConfig p;p.id="mock";p.base_url="http://127.0.0.1:19101/v1";p.authentication=gateway::Authentication::bearer;p.key_vendor="mock";p.key_slot="default";p.model_discovery=true;p.allowlist={{gateway::RuleType::glob,"mock/allowed/*"}};c.providers.emplace("mock",p);gateway::ProviderConfig failed;failed.id="failed";failed.base_url="http://127.0.0.1:19999/v1";failed.authentication=gateway::Authentication::none;failed.model_discovery=true;failed.allowlist={{gateway::RuleType::glob,"failed/*"}};c.providers.emplace("failed",failed);c.model_cache.ttl_sec=60;return c;}
}
int main(){
  auto route=gateway::route_model("openrouter/vendor/model");CHECK(route&&route->provider_id=="openrouter"&&route->upstream_model_id=="vendor/model");CHECK(!gateway::route_model("model"));
  CHECK(gateway::glob_match("*",""));CHECK(gateway::glob_match("a?c","abc"));CHECK(!gateway::glob_match("a?c","ac"));CHECK(gateway::glob_match("模型/*","模型/甲"));CHECK(!gateway::glob_match("exact","mismatch"));
  CHECK(gateway::normalize_vendor(" Google ")=="gemini");CHECK(gateway::normalize_vendor("OpenRouter")=="openrouter");CHECK(gateway::normalize_slot(" ")=="default");gateway::ProviderConfig deny;deny.id="deny";CHECK(!gateway::model_allowed(deny,"deny/model"));
  CHECK(gateway::constant_time_equal("same","same"));CHECK(!gateway::constant_time_equal("same","diff"));
  httplib::Server provider;provider.Get("/v1/models",[](const auto& req,auto& res){CHECK(req.get_header_value("Authorization")=="Bearer upstream-secret");res.set_content(R"({"object":"list","data":[{"id":"allowed/a"},{"id":"denied/a"}]})","application/json");});
  provider.Post("/v1/chat/completions",[](const auto& req,auto& res){CHECK(req.get_header_value("Authorization")=="Bearer upstream-secret");CHECK(req.get_header_value("Authorization")!="Bearer client-secret");auto j=nlohmann::json::parse(req.body);CHECK(j["model"]=="allowed/model");CHECK(j["unknown"]==42);res.set_chunked_content_provider("text/event-stream",[index=std::size_t{0}](std::size_t,httplib::DataSink& sink) mutable {static const char* chunks[]={"data: 1\n\n","data: 2\n\n","data: [DONE]\n\n"};if(index>=3){sink.done();return false;}auto chunk=chunks[index++];sink.write(chunk,strlen(chunk));std::this_thread::sleep_for(140ms);return true;});});
  std::thread pt([&]{provider.listen("127.0.0.1",19101);});while(!provider.is_running())std::this_thread::yield();
  auto store=std::make_unique<MockStore>();auto logger=std::make_unique<gateway::Logger>("gateway-tests.log",gateway::LogLevel::debug);gateway::Gateway app(config(),std::move(store),std::move(logger));std::thread gt([&]{app.listen();});std::this_thread::sleep_for(80ms);
  httplib::Client client("127.0.0.1",19102);auto missing=client.Get("/v1/models");CHECK(missing&&missing->status==401);auto malformed=client.Get("/v1/models",{{"Authorization","Basic nope"}});CHECK(malformed&&malformed->status==401);auto invalid=client.Get("/v1/models",{{"Authorization","Bearer wrong"}});CHECK(invalid&&invalid->status==401);httplib::Headers auth{{"Authorization","Bearer client-secret"}};auto models=client.Get("/v1/models",auth);CHECK(models&&models->status==200);if(models){auto j=nlohmann::json::parse(models->body);CHECK(j["data"].size()==1);CHECK(j["data"][0]["id"]=="mock/allowed/a");}
  httplib::Headers preflight{{"Origin","http://127.0.0.1:3000"},{"Access-Control-Request-Method","POST"},{"Access-Control-Request-Headers","Authorization, Content-Type"}};auto options=client.Options("/v1/chat/completions",preflight);CHECK(options&&options->status==204);if(options){CHECK(options->get_header_value("Access-Control-Allow-Origin")=="http://127.0.0.1:3000");CHECK(options->get_header_value("Vary")=="Origin");CHECK(options->get_header_value("Access-Control-Allow-Headers").find("Authorization")!=std::string::npos);}
  auto forbidden_origin=client.Options("/v1/chat/completions",{{"Origin","http://evil.example"},{"Access-Control-Request-Method","POST"}});CHECK(forbidden_origin&&forbidden_origin->status==403);CHECK(forbidden_origin&&forbidden_origin->get_header_value("Access-Control-Allow-Origin").empty());
  auto forbidden_header=client.Options("/v1/chat/completions",{{"Origin","http://127.0.0.1:3000"},{"Access-Control-Request-Method","POST"},{"Access-Control-Request-Headers","X-Forbidden"}});CHECK(forbidden_header&&forbidden_header->status==403);
  auto cors_models=client.Get("/v1/models",{{"Authorization","Bearer client-secret"},{"Origin","http://127.0.0.1:3000"}});CHECK(cors_models&&cors_models->status==200);CHECK(cors_models&&cors_models->get_header_value("Access-Control-Allow-Origin")=="http://127.0.0.1:3000");
  auto denied=client.Post("/v1/chat/completions",auth,R"({"model":"mock/no/model"})","application/json");CHECK(denied&&denied->status==403);
  std::vector<long long> arrivals;auto start=std::chrono::steady_clock::now();httplib::Request stream_req;stream_req.method="POST";stream_req.path="/v1/chat/completions";stream_req.headers=auth;stream_req.set_header("Content-Type","application/json");stream_req.body=R"({"model":"mock/allowed/model","unknown":42,"messages":[]})";stream_req.content_receiver=[&](const char*,std::size_t,uint64_t,uint64_t){arrivals.push_back(std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now()-start).count());return true;};auto streamed=client.send(stream_req);CHECK(streamed&&streamed->status==200);CHECK(arrivals.size()>=3);if(arrivals.size()>=3){CHECK(arrivals[1]-arrivals[0]>=80);CHECK(arrivals[2]-arrivals[1]>=80);}
  std::string large(1024*1024,'A');auto vlm=nlohmann::json{{"model","mock/allowed/model"},{"image",large},{"unknown",42}}.dump();auto large_result=client.Post("/v1/chat/completions",auth,vlm,"application/json");CHECK(large_result&&large_result->status==200);
  std::string multipart="--boundary\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\nmock/allowed/model\r\n--boundary--\r\n";auto multipart_result=client.Post("/v1/files",auth,multipart,"multipart/form-data; boundary=boundary");CHECK(multipart_result&&multipart_result->status==400);
  app.stop();provider.stop();gt.join();pt.join();std::ifstream logs("gateway-tests.log");std::string log((std::istreambuf_iterator<char>(logs)),{});CHECK(log.find("client-secret")==std::string::npos);CHECK(log.find("upstream-secret")==std::string::npos);std::cout<<(failures?"FAILED ":"PASSED ")<<failures<<" checks failed\n";return failures?1:0;
}
