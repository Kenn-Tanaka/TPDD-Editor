#pragma once
#include "gateway/config.hpp"
#include "gateway/credential_store.hpp"
#include "gateway/logger.hpp"
#include <httplib.h>
#include <nlohmann/json.hpp>
#include <chrono>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace gateway {
struct ParsedUrl { bool https; std::string host; int port; std::string base_path; };
ParsedUrl parse_base_url(const std::string& url);
bool constant_time_equal(std::string_view a, std::string_view b) noexcept;
std::string make_error(std::string_view type, std::string_view message);
httplib::Headers filtered_request_headers(const httplib::Headers& input);
httplib::Headers filtered_response_headers(const httplib::Headers& input);

class Proxy {
public:
  Proxy(Config config, ICredentialStore& credentials, Logger& logger);
  void handle(const httplib::Request& request, httplib::Response& response);
  void handle_models(const httplib::Request& request, httplib::Response& response);
private:
  bool authenticate(const httplib::Request& request, httplib::Response& response);
  std::unique_ptr<httplib::Client> client_for(const ProviderConfig& provider) const;
  Config config_; ICredentialStore& credentials_; CredentialResolver resolver_; Logger& logger_;
  struct CacheEntry { std::vector<nlohmann::json> models; std::chrono::steady_clock::time_point updated_at; };
  std::unordered_map<std::string, CacheEntry> model_cache_; std::mutex cache_mutex_;
};
}
