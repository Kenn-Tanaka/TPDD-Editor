#pragma once
#include <optional>
#include <string>
#include <vector>

namespace gateway {
enum class RuleType { exact, glob };
enum class Authentication { bearer, none };
struct ModelRule { RuleType type; std::string pattern; };
struct ProviderConfig {
  std::string id;
  std::string base_url;
  Authentication authentication{Authentication::none};
  std::string key_vendor;
  std::string key_slot{"default"};
  bool model_discovery{true};
  std::vector<ModelRule> allowlist;
};
}
