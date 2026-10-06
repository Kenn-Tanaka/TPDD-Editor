#include "gateway/config.hpp"
#include "gateway/credential_store.hpp"
#include "gateway/gateway.hpp"
#include "gateway/logger.hpp"
#include <csignal>
#include <iostream>
#include <string>
#include <filesystem>
#include <thread>

namespace fs = std::filesystem;

namespace {
gateway::Gateway* running = nullptr;
void stop_handler(int) {
  if (running) running->stop();
}
}

int main(int argc, char** argv) {
  std::string configPath = "";

  if (argc == 1) {
    // Search default config locations
    std::vector<std::string> candidates = {
      "gateway.json",
      "config/gateway.json",
      "tools/llm-gateway/config/gateway.json"
    };
    for (const auto& c : candidates) {
      if (fs::exists(c)) {
        configPath = c;
        break;
      }
    }
    if (configPath.empty()) {
      configPath = "gateway.json";
    }
  } else if (argc == 2) {
    std::string arg1 = argv[1];
    if (arg1 == "--help" || arg1 == "-h") {
      std::cout << "Lightweight LLM Gateway v1.3.2\n"
                << "Usage:\n"
                << "  llm-gateway [config.json]\n"
                << "  llm-gateway --config <config.json>\n";
      return 0;
    }
    configPath = arg1;
  } else if (argc == 3 && (std::string(argv[1]) == "--config" || std::string(argv[1]) == "-c")) {
    configPath = argv[2];
  } else {
    std::cerr << "usage: llm-gateway [config.json] or llm-gateway --config <config.json>\n";
    return 2;
  }

  try {
    auto config = gateway::load_config(configPath);
    auto logger = std::make_unique<gateway::Logger>(config.logging.file, gateway::parse_log_level(config.logging.level));
    auto credentials = gateway::make_platform_credential_store();
    if (config.security.client_auth && !credentials->get(config.credentials.service_name, config.security.credential_name)) {
      throw std::runtime_error("client credential unavailable (check credential manager)");
    }
    gateway::Gateway app(std::move(config), std::move(credentials), std::move(logger));
    running = &app;
    std::signal(SIGINT, stop_handler);
    std::signal(SIGTERM, stop_handler);
    bool ok = app.listen();
    running = nullptr;
    return ok ? 0 : 1;
  } catch (const std::exception& e) {
    std::cerr << "fatal: " << e.what() << '\n';
    return 1;
  }
}

