#include "gateway/credential_store.hpp"
#include <windows.h>
#include <wincred.h>
#include <stdexcept>
#include <vector>
namespace gateway {
namespace {
std::wstring widen(const std::string& s){if(s.empty())return{};int n=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,s.data(),static_cast<int>(s.size()),nullptr,0);if(!n)throw std::runtime_error("invalid UTF-8 credential id");std::wstring w(n,L'\0');MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,s.data(),static_cast<int>(s.size()),w.data(),n);return w;}
std::string narrow_secret(const BYTE* bytes,DWORD size){if(size%sizeof(wchar_t)==0&&size>0){auto* wide=reinterpret_cast<const wchar_t*>(bytes);int count=static_cast<int>(size/sizeof(wchar_t));int n=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,wide,count,nullptr,0,nullptr,nullptr);if(n>0){std::string out(n,'\0');WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,wide,count,out.data(),n,nullptr,nullptr);return out;}}return std::string(reinterpret_cast<const char*>(bytes),reinterpret_cast<const char*>(bytes)+size);}
class WindowsCredentialStore final:public ICredentialStore { public: std::optional<Secret> get(std::string_view service,std::string_view username)override{auto ws=widen(std::string(service)),wu=widen(std::string(username));for(const auto& target:{ws,wu+L"@"+ws}){PCREDENTIALW cred=nullptr;if(!CredReadW(target.c_str(),CRED_TYPE_GENERIC,0,&cred))continue;struct Guard{PCREDENTIALW p;~Guard(){CredFree(p);}}guard{cred};if(!cred->UserName||wu!=cred->UserName)continue;return Secret(narrow_secret(cred->CredentialBlob,cred->CredentialBlobSize));}return std::nullopt;}};
}
std::unique_ptr<ICredentialStore> make_platform_credential_store(){return std::make_unique<WindowsCredentialStore>();}
}
