#include "manager/credential_store.hpp"
#include <windows.h>
#include <wincred.h>
#include <algorithm>
#include <cstring>
#include <stdexcept>
#include <vector>

namespace manager {
namespace {
std::wstring widen(std::string_view text){if(text.empty())return{};int count=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.data(),static_cast<int>(text.size()),nullptr,0);if(!count)throw std::runtime_error("invalid UTF-8");std::wstring out(count,L'\0');MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.data(),static_cast<int>(text.size()),out.data(),count);return out;}
std::string narrow(const wchar_t* text){if(!text)return{};int count=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,text,-1,nullptr,0,nullptr,nullptr);if(count<=1)return{};std::string out(count-1,'\0');WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,text,-1,out.data(),count,nullptr,nullptr);return out;}
StoreResult error_result(){auto error=GetLastError();if(error==ERROR_NOT_FOUND)return StoreResult::not_found;if(error==ERROR_ACCESS_DENIED)return StoreResult::access_denied;return StoreResult::unknown_error;}
bool read(const std::wstring& target,PCREDENTIALW* out){return CredReadW(target.c_str(),CRED_TYPE_GENERIC,0,out)!=FALSE;}
StoreResult write(const std::wstring& target,const std::wstring& username,std::span<const wchar_t> secret){CREDENTIALW c{};c.Type=CRED_TYPE_GENERIC;c.TargetName=const_cast<wchar_t*>(target.c_str());c.UserName=const_cast<wchar_t*>(username.c_str());c.Comment=const_cast<wchar_t*>(L"Stored using LLM Gateway Credential Manager (Python keyring compatible)");c.CredentialBlobSize=static_cast<DWORD>(secret.size_bytes());c.CredentialBlob=reinterpret_cast<LPBYTE>(const_cast<wchar_t*>(secret.data()));for(auto persist:{CRED_PERSIST_ENTERPRISE,CRED_PERSIST_LOCAL_MACHINE,CRED_PERSIST_SESSION}){c.Persist=persist;if(CredWriteW(&c,0))return StoreResult::success;}return error_result();}
class WindowsStore final:public ICredentialStore{
public:
  StoreResult store(std::string_view service,std::string_view username,std::span<const wchar_t> secret)override{try{auto ws=widen(service),wu=widen(username);PCREDENTIALW existing=nullptr;if(read(ws,&existing)){std::wstring old_user=existing->UserName?existing->UserName:L"";if(old_user!=wu){std::vector<wchar_t> old_secret(existing->CredentialBlobSize/sizeof(wchar_t));std::memcpy(old_secret.data(),existing->CredentialBlob,existing->CredentialBlobSize);auto moved=write(old_user+L"@"+ws,old_user,old_secret);SecureZeroMemory(old_secret.data(),old_secret.size()*sizeof(wchar_t));CredFree(existing);if(moved!=StoreResult::success)return moved;}else CredFree(existing);}return write(ws,wu,secret);}catch(...){return StoreResult::invalid_data;}}
  StoreResult remove(std::string_view service,std::string_view username)override{try{auto ws=widen(service),wu=widen(username);bool deleted=false;for(const auto& target:{ws,wu+L"@"+ws}){PCREDENTIALW c=nullptr;if(read(target,&c)){bool match=c->UserName&&wu==c->UserName;CredFree(c);if(match){if(!CredDeleteW(target.c_str(),CRED_TYPE_GENERIC,0))return error_result();deleted=true;}}}return deleted?StoreResult::success:StoreResult::not_found;}catch(...){return StoreResult::invalid_data;}}
  std::vector<CredentialMetadata> list(std::string_view service)override{std::vector<CredentialMetadata> out;auto ws=widen(service);DWORD count=0;PCREDENTIALW* credentials=nullptr;if(!CredEnumerateW(nullptr,0,&count,&credentials)){if(GetLastError()==ERROR_NOT_FOUND)return out;throw std::runtime_error("CredEnumerateW failed");}for(DWORD i=0;i<count;++i){auto* c=credentials[i];std::wstring target=c->TargetName?c->TargetName:L"";bool relevant=target==ws||(target.size()>ws.size()+1&&target.ends_with(L"@"+ws));if(relevant&&c->UserName)out.push_back({std::string(service),narrow(c->UserName)});}CredFree(credentials);std::sort(out.begin(),out.end(),[](const auto& a,const auto& b){return a.username<b.username;});out.erase(std::unique(out.begin(),out.end(),[](const auto& a,const auto& b){return a.username==b.username;}),out.end());return out;}
};
}
std::unique_ptr<ICredentialStore> make_credential_store(){return std::make_unique<WindowsStore>();}
}
