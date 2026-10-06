#pragma once
#include <string>
#include <string_view>

namespace gateway {
class Secret final {
public:
  explicit Secret(std::string value);
  Secret(const Secret&) = delete;
  Secret& operator=(const Secret&) = delete;
  Secret(Secret&& other) noexcept;
  Secret& operator=(Secret&& other) noexcept;
  ~Secret();
  [[nodiscard]] std::string_view view() const noexcept { return value_; }
private:
  void clear() noexcept;
  std::string value_;
};
}
