#include "gateway/model_router.hpp"
namespace gateway {
std::optional<ModelRoute> route_model(std::string_view id) {
  auto pos=id.find('/'); if (pos==std::string_view::npos || pos==0 || pos+1>=id.size()) return std::nullopt;
  return ModelRoute{std::string(id.substr(0,pos)), std::string(id.substr(pos+1))};
}
}
