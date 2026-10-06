#include "gateway/model_filter.hpp"
namespace gateway {
bool glob_match(std::string_view p, std::string_view s) noexcept {
  std::size_t pi=0, si=0, star=std::string_view::npos, match=0;
  while(si<s.size()) {
    if(pi<p.size() && (p[pi]=='?' || p[pi]==s[si])) { ++pi; ++si; }
    else if(pi<p.size() && p[pi]=='*') { star=pi++; match=si; }
    else if(star!=std::string_view::npos) { pi=star+1; si=++match; }
    else return false;
  }
  while(pi<p.size() && p[pi]=='*') ++pi;
  return pi==p.size();
}
bool model_allowed(const ProviderConfig& provider, std::string_view id) noexcept {
  if(provider.allowlist.empty()) return false;
  for(const auto& r:provider.allowlist) if((r.type==RuleType::exact && r.pattern==id) || (r.type==RuleType::glob && glob_match(r.pattern,id))) return true;
  return false;
}
}
