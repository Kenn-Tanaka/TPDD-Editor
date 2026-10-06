#pragma once
#include <fstream>
#include <mutex>
#include <string>
#include <string_view>
namespace gateway {
enum class LogLevel { error, warn, info, debug };
class Logger {
public:
  Logger(std::string path, LogLevel level);
  void log(LogLevel level, std::string_view message);
  void flush();
private:
  std::mutex mutex_; std::ofstream file_; LogLevel level_;
};
LogLevel parse_log_level(std::string_view level);
}
