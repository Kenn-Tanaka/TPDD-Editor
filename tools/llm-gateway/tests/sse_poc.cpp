#include <httplib.h>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <deque>
#include <iostream>
#include <memory>
#include <mutex>
#include <thread>
#include <vector>
using namespace std::chrono_literals;
int main(){
  httplib::Server provider, gateway;
  provider.Get("/events",[](const httplib::Request&,httplib::Response& res){
    res.set_chunked_content_provider("text/event-stream",[index=std::size_t{0}](std::size_t,httplib::DataSink& sink) mutable {
      static constexpr const char* chunks[]={"data: one\n\n","data: two\n\n","data: three\n\n"};
      if(index>=3){sink.done();return false;} auto chunk=chunks[index++];sink.write(chunk,std::char_traits<char>::length(chunk));std::this_thread::sleep_for(180ms);return true;
    });
  });
  std::thread pt([&]{provider.listen("127.0.0.1",19091);}); while(!provider.is_running())std::this_thread::yield();
  gateway.Get("/events",[](const httplib::Request&,httplib::Response& res){
    struct State{std::mutex mutex;std::condition_variable cv;std::deque<std::string> chunks;bool done=false;};
    auto state=std::make_shared<State>();std::thread([state]{httplib::Client upstream("127.0.0.1",19091);upstream.Get("/events",[state](const char* data,std::size_t len){std::lock_guard lock(state->mutex);state->chunks.emplace_back(data,len);state->cv.notify_one();return true;});{std::lock_guard lock(state->mutex);state->done=true;}state->cv.notify_one();}).detach();
    res.set_chunked_content_provider("text/event-stream",[state](std::size_t,httplib::DataSink& sink){std::unique_lock lock(state->mutex);state->cv.wait(lock,[&]{return !state->chunks.empty()||state->done;});if(!state->chunks.empty()){auto chunk=std::move(state->chunks.front());state->chunks.pop_front();lock.unlock();return sink.write(chunk.data(),chunk.size());}lock.unlock();sink.done();return false;});
  });
  std::thread gt([&]{gateway.listen("127.0.0.1",19092);}); while(!gateway.is_running())std::this_thread::yield();
  httplib::Client client("127.0.0.1",19092); std::vector<long long> arrivals; auto start=std::chrono::steady_clock::now();
  auto result=client.Get("/events",[&](const char*,std::size_t){arrivals.push_back(std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now()-start).count());return true;});
  gateway.stop();provider.stop();gt.join();pt.join();
  if(!result||arrivals.size()<3){std::cerr<<"PoC failed: chunks="<<arrivals.size()<<"\n";return 1;}
  std::cout<<"SSE PoC arrival_ms:";for(auto t:arrivals)std::cout<<' '<<t;std::cout<<"\n";
  if(arrivals[1]-arrivals[0]<100||arrivals[2]-arrivals[1]<100){std::cerr<<"PoC failed: response appears buffered\n";return 2;}
  return 0;
}
