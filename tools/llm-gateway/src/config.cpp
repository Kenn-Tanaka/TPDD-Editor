#include "gateway/config.hpp"
#include "gateway/credential_store.hpp"
#include <algorithm>
#include <fstream>
#include <nlohmann/json.hpp>
#include <stdexcept>
#include <unordered_set>

namespace gateway {

using json = nlohmann::json;

Config load_config(const std::string& path) {
  std::ifstream in(path);
  if (!in) {
    throw std::runtime_error("cannot open config: " + path);
  }

  json j;
  in >> j;
  Config c;

  if (auto x = j.find("listen"); x != j.end()) {
    c.listen.address = x->value("address", c.listen.address);
    c.listen.port = x->value("port", c.listen.port);
  }

  if (auto x = j.find("security"); x != j.end()) {
    c.security.client_auth = x->value("client_auth", true);
    c.security.credential_name = x->value("credential_name", c.security.credential_name);
  }

  if (auto x = j.find("credentials"); x != j.end()) {
    c.credentials.service_name = x->value("service_name", c.credentials.service_name);
    c.credentials.environment_fallback = x->value("environment_fallback", false);
  }

  if (auto x = j.find("proxy"); x != j.end()) {
    c.proxy.max_request_body_mb = x->value("max_request_body_mb", c.proxy.max_request_body_mb);
    c.proxy.connect_timeout_sec = x->value("connect_timeout_sec", 10);
    c.proxy.read_timeout_sec = x->value("read_timeout_sec", 600);
    c.proxy.write_timeout_sec = x->value("write_timeout_sec", 600);
  }

  if (auto x = j.find("model_cache"); x != j.end()) {
    c.model_cache.enabled = x->value("enabled", true);
    c.model_cache.ttl_sec = x->value("ttl_sec", 3600);
  }

  if (auto x = j.find("logging"); x != j.end()) {
    c.logging.level = x->value("level", "info");
    c.logging.file = x->value("file", "llm-gateway.log");
  }

  if (auto x = j.find("cors"); x != j.end()) {
    c.cors.enabled = x->value("enabled", false);
    c.cors.allowed_origins = x->value("allowed_origins", c.cors.allowed_origins);
    c.cors.allowed_methods = x->value("allowed_methods", c.cors.allowed_methods);
    c.cors.allowed_headers = x->value("allowed_headers", c.cors.allowed_headers);
    c.cors.max_age_sec = x->value("max_age_sec", c.cors.max_age_sec);
  }

  if (j.contains("providers")) {
    for (auto& [id, p] : j["providers"].items()) {
      ProviderConfig pc;
      pc.id = id;
      pc.base_url = p.at("base_url").get<std::string>();

      auto auth = p.value("authentication", "");
      if (auth == "bearer") {
        pc.authentication = Authentication::bearer;
      } else if (auth == "none") {
        pc.authentication = Authentication::none;
      } else {
        throw std::runtime_error("unsupported authentication for provider: " + id);
      }

      if (pc.authentication == Authentication::bearer) {
        pc.key_vendor = p.at("key_vendor").get<std::string>();
        pc.key_slot = p.value("key_slot", "default");
      }

      pc.model_discovery = p.value("model_discovery", true);

      if (p.contains("allowlist")) {
        for (const auto& r : p["allowlist"]) {
          auto type = r.at("type").get<std::string>();
          if (type != "exact" && type != "glob") {
            throw std::runtime_error("unsupported allowlist rule type: " + type);
          }
          pc.allowlist.push_back({type == "exact" ? RuleType::exact : RuleType::glob,
                                  r.at("pattern")});
        }
      }

      c.providers.emplace(id, std::move(pc));
    }
  }

  auto trim = [](std::string& value) {
    auto first = value.find_first_not_of(" \t\r\n");
    if (first == std::string::npos) {
      value.clear();
      return;
    }
    auto last = value.find_last_not_of(" \t\r\n");
    value = value.substr(first, last - first + 1);
  };

  trim(c.credentials.service_name);
  trim(c.security.credential_name);
  for (auto& [_, p] : c.providers) {
    trim(p.key_vendor);
    trim(p.key_slot);
  }

  validate_config(c);
  return c;
}

void validate_config(const Config& c) {
  if (c.listen.address != "127.0.0.1" && c.listen.address != "::1") {
    throw std::runtime_error("listen.address must be 127.0.0.1 or ::1");
  }
  if (c.listen.port < 1 || c.listen.port > 65535) {
    throw std::runtime_error("invalid listen.port");
  }
  if (c.security.client_auth && c.security.credential_name.empty()) {
    throw std::runtime_error("client credential name is required");
  }

  auto service = c.credentials.service_name;
  auto first = service.find_first_not_of(" \t\r\n");
  auto last = service.find_last_not_of(" \t\r\n");
  if (first == std::string::npos) {
    throw std::runtime_error("credential service_name must not be empty");
  }
  service = service.substr(first, last - first + 1);
  if (service.size() > 128 ||
      std::any_of(service.begin(), service.end(), [](unsigned char ch) {
        return ch < 0x20 || ch == 0x7f;
      })) {
    throw std::runtime_error("invalid credential service_name");
  }

  if (c.providers.empty()) {
    throw std::runtime_error("at least one provider is required");
  }

  for (const auto& [id, p] : c.providers) {
    if (id.empty() || id.find('/') != std::string::npos) {
      throw std::runtime_error("invalid provider id: " + id);
    }
    if (!(p.base_url.starts_with("http://") || p.base_url.starts_with("https://"))) {
      throw std::runtime_error("invalid provider base_url: " + id);
    }
    if (p.authentication == Authentication::bearer) {
      normalize_vendor(p.key_vendor);
      normalize_slot(p.key_slot);
    }
    for (const auto& r : p.allowlist) {
      if (r.pattern.empty()) {
        throw std::runtime_error("empty allowlist pattern: " + id);
      }
    }
  }

  if (c.proxy.max_request_body_mb == 0) {
    throw std::runtime_error("max_request_body_mb must be positive");
  }

  if (c.cors.enabled && c.cors.allowed_origins.empty()) {
    throw std::runtime_error("cors.allowed_origins must not be empty when CORS is enabled");
  }
  for (const auto& origin : c.cors.allowed_origins) {
    if (origin == "*" || origin.empty() || origin.back() == '/' ||
        (!(origin.starts_with("http://") || origin.starts_with("https://")))) {
      throw std::runtime_error("invalid CORS allowed origin: " + origin);
    }
  }

  const std::unordered_set<std::string> supported_methods{"GET", "POST", "DELETE",
                                                          "PUT", "PATCH", "OPTIONS"};
  if (c.cors.enabled && c.cors.allowed_methods.empty()) {
    throw std::runtime_error("cors.allowed_methods must not be empty when CORS is enabled");
  }
  for (const auto& method : c.cors.allowed_methods) {
    if (!supported_methods.contains(method)) {
      throw std::runtime_error("unsupported CORS method: " + method);
    }
  }

  if (c.cors.max_age_sec < 0) {
    throw std::runtime_error("cors.max_age_sec must not be negative");
  }

  for (const auto& header : c.cors.allowed_headers) {
    if (header.empty() ||
        std::any_of(header.begin(), header.end(), [](unsigned char ch) {
          return ch <= 0x20 || ch >= 0x7f ||
                 std::string_view("()<>@,;:\\\"/[]?={}").find(static_cast<char>(ch)) !=
                     std::string_view::npos;
        })) {
      throw std::runtime_error("invalid CORS allowed header: " + header);
    }
  }
}

} // namespace gateway
