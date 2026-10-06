#pragma once
#include "gateway/secret.hpp"
#include <memory>
#include <optional>
#include <string>

namespace gateway {
class ICredentialStore {
public:
  virtual std::optional<Secret> get(std::string_view service, std::string_view username) = 0;
  virtual ~ICredentialStore() = default;
};
std::unique_ptr<ICredentialStore> make_platform_credential_store();

class CredentialResolver final {
public:
  CredentialResolver(ICredentialStore& store, std::string service_name, bool environment_fallback);
  std::optional<Secret> resolve_provider(std::string_view vendor, std::string_view slot);
  std::optional<Secret> resolve_named(std::string_view credential_name);
  [[nodiscard]] const std::string& service_name() const noexcept { return service_name_; }
private:
  ICredentialStore& store_;
  std::string service_name_;
  bool environment_fallback_;
};

std::string normalize_vendor(std::string_view vendor);
std::string normalize_slot(std::string_view slot);
}
