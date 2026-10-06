#pragma once
#include "gateway/provider.hpp"
#include <cstddef>
#include <string>
#include <unordered_map>
#include <vector>

namespace gateway {
struct ListenConfig { std::string address{"127.0.0.1"}; int port{8765}; };
struct SecurityConfig { bool client_auth{true}; std::string credential_name{"llm_gateway|default"}; };
struct CredentialsConfig { std::string service_name{"CloudLLM"}; bool environment_fallback{false}; };
struct ProxyConfig { std::size_t max_request_body_mb{64}; int connect_timeout_sec{10}; int read_timeout_sec{600}; int write_timeout_sec{600}; };
struct ModelCacheConfig { bool enabled{true}; int ttl_sec{3600}; };
struct LoggingConfig { std::string level{"info"}; std::string file{"llm-gateway.log"}; };
struct CorsConfig {
  bool enabled{false};
  std::vector<std::string> allowed_origins;
  std::vector<std::string> allowed_methods{"GET","POST","DELETE","PUT","PATCH","OPTIONS"};
  std::vector<std::string> allowed_headers{"Authorization","Content-Type","Accept"};
  int max_age_sec{600};
};
struct Config {
  ListenConfig listen; SecurityConfig security; CredentialsConfig credentials; ProxyConfig proxy; ModelCacheConfig model_cache;
  std::unordered_map<std::string, ProviderConfig> providers; LoggingConfig logging; CorsConfig cors;
};
Config load_config(const std::string& path);
void validate_config(const Config& config);
}
