#pragma once
#include <memory>
#include <span>
#include <string>
#include <string_view>
#include <vector>

namespace manager {
enum class StoreResult { success, not_found, unavailable, access_denied, invalid_data, unknown_error };
struct CredentialMetadata { std::string service; std::string username; };
class ICredentialStore {
public:
  virtual StoreResult store(std::string_view service,std::string_view username,std::span<const wchar_t> secret)=0;
  virtual StoreResult remove(std::string_view service,std::string_view username)=0;
  virtual std::vector<CredentialMetadata> list(std::string_view service)=0;
  virtual ~ICredentialStore()=default;
};
std::unique_ptr<ICredentialStore> make_credential_store();
}
