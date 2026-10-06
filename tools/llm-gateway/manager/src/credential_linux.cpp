#include "manager/credential_store.hpp"
#include <libsecret/secret.h>
#include <climits>
#include <cwchar>
#include <stdexcept>

namespace manager {
namespace {
const SecretSchema schema={"org.freedesktop.Secret.Generic",SECRET_SCHEMA_NONE,{{"service",SECRET_SCHEMA_ATTRIBUTE_STRING},{"username",SECRET_SCHEMA_ATTRIBUTE_STRING},{nullptr,SECRET_SCHEMA_ATTRIBUTE_STRING}}};
StoreResult map_error(GError* error){if(!error)return StoreResult::unknown_error;auto result=error->domain==G_IO_ERROR&&error->code==G_IO_ERROR_PERMISSION_DENIED?StoreResult::access_denied:StoreResult::unavailable;g_error_free(error);return result;}
std::string utf8(std::span<const wchar_t> value){std::mbstate_t state{};std::string out;char buffer[MB_LEN_MAX];for(auto wc:value){auto n=std::wcrtomb(buffer,wc,&state);if(n==static_cast<std::size_t>(-1))throw std::runtime_error("invalid secret text");out.append(buffer,n);}return out;}
class LinuxStore final:public ICredentialStore{
public:
  StoreResult store(std::string_view service,std::string_view username,std::span<const wchar_t> secret)override{try{auto s=std::string(service),u=std::string(username),p=utf8(secret);GError* error=nullptr;auto label="Password for '"+u+"' on '"+s+"'";bool ok=secret_password_store_sync(&schema,SECRET_COLLECTION_DEFAULT,label.c_str(),p.c_str(),nullptr,&error,"service",s.c_str(),"username",u.c_str(),nullptr);std::fill(p.begin(),p.end(),'\0');return ok?StoreResult::success:map_error(error);}catch(...){return StoreResult::invalid_data;}}
  StoreResult remove(std::string_view service,std::string_view username)override{auto s=std::string(service),u=std::string(username);GError* error=nullptr;bool ok=secret_password_clear_sync(&schema,nullptr,&error,"service",s.c_str(),"username",u.c_str(),nullptr);if(error)return map_error(error);return ok?StoreResult::success:StoreResult::not_found;}
  std::vector<CredentialMetadata> list(std::string_view service)override{std::vector<CredentialMetadata> out;GError* error=nullptr;auto* svc=secret_service_get_sync(SECRET_SERVICE_NONE,nullptr,&error);if(!svc){map_error(error);throw std::runtime_error("Secret Service unavailable");}auto s=std::string(service);auto* attrs=secret_attributes_build(&schema,"service",s.c_str(),nullptr);auto* items=secret_service_search_sync(svc,&schema,attrs,SECRET_SEARCH_ALL,nullptr,&error);g_hash_table_unref(attrs);g_object_unref(svc);if(error){map_error(error);throw std::runtime_error("Secret Service search failed");}for(auto* node=items;node;node=node->next){auto* item=SECRET_ITEM(node->data);auto* values=secret_item_get_attributes(item);auto* username=static_cast<const char*>(g_hash_table_lookup(values,"username"));if(username)out.push_back({s,username});g_hash_table_unref(values);}g_list_free_full(items,[](gpointer item){g_object_unref(item);});return out;}
};
}
std::unique_ptr<ICredentialStore> make_credential_store(){return std::make_unique<LinuxStore>();}
}
