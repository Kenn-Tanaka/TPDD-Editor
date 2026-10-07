#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <winsock2.h>
#include <ws2tcpip.h>

#include <chrono>
#include <filesystem>
#include <iostream>
#include <string>
#include <thread>

namespace fs = std::filesystem;

namespace {
constexpr unsigned short kGatewayPort = 8765;
constexpr unsigned short kEditorPort = 3000;
constexpr auto kStartupTimeout = std::chrono::seconds(30);

struct Layout {
  fs::path gatewayDirectory;
  fs::path gatewayExe;
  fs::path gatewayConfig;
  fs::path appDirectory;
  fs::path serverScript;
};

std::wstring quote(const fs::path& value) {
  return L"\"" + value.wstring() + L"\"";
}

fs::path executableDirectory() {
  std::wstring buffer(32768, L'\0');
  const DWORD length = GetModuleFileNameW(nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
  if (length == 0 || length == buffer.size()) {
    throw std::runtime_error("ランチャーの配置先を取得できませんでした。");
  }
  buffer.resize(length);
  return fs::path(buffer).parent_path();
}

Layout resolveLayout(const fs::path& launcherDirectory) {
  Layout packaged{
    launcherDirectory / L"gateway",
    launcherDirectory / L"gateway" / L"llm-gateway.exe",
    launcherDirectory / L"gateway" / L"config" / L"gateway.json",
    launcherDirectory / L"app",
    launcherDirectory / L"app" / L"serve.mjs",
  };
  if (fs::exists(packaged.gatewayExe) && fs::exists(packaged.serverScript)) {
    return packaged;
  }

  // Development-tree layout: release/TPDD-Launcher.exe
  const fs::path projectRoot = launcherDirectory.parent_path();
  Layout development{
    projectRoot / L"tools" / L"llm-gateway",
    projectRoot / L"tools" / L"llm-gateway" / L"llm-gateway.exe",
    projectRoot / L"tools" / L"llm-gateway" / L"config" / L"gateway.json",
    projectRoot,
    projectRoot / L"scripts" / L"serve-dist.mjs",
  };
  if (!fs::exists(development.gatewayConfig)) {
    development.gatewayConfig = projectRoot / L"tools" / L"llm-gateway" /
                                L"config" / L"gateway.example.json";
  }
  return development;
}

bool isPortOpen(unsigned short port) {
  SOCKET socketHandle = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (socketHandle == INVALID_SOCKET) return false;

  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_port = htons(port);
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);

  const bool connected = connect(
    socketHandle,
    reinterpret_cast<const sockaddr*>(&address),
    sizeof(address)
  ) == 0;
  closesocket(socketHandle);
  return connected;
}

bool processExited(HANDLE process) {
  return process && WaitForSingleObject(process, 0) == WAIT_OBJECT_0;
}

PROCESS_INFORMATION startProcess(
  const std::wstring& commandLine,
  const fs::path& workingDirectory
) {
  std::wstring command = commandLine;
  STARTUPINFOW startupInfo{};
  startupInfo.cb = sizeof(startupInfo);
  PROCESS_INFORMATION processInfo{};

  if (!CreateProcessW(
        nullptr,
        command.data(),
        nullptr,
        nullptr,
        FALSE,
        CREATE_NEW_CONSOLE,
        nullptr,
        workingDirectory.c_str(),
        &startupInfo,
        &processInfo
      )) {
    throw std::runtime_error("プロセスを起動できませんでした。Windowsエラー: " +
                             std::to_string(GetLastError()));
  }

  CloseHandle(processInfo.hThread);
  return processInfo;
}

bool waitForPort(unsigned short port, HANDLE childProcess) {
  const auto deadline = std::chrono::steady_clock::now() + kStartupTimeout;
  while (std::chrono::steady_clock::now() < deadline) {
    if (isPortOpen(port)) return true;
    if (processExited(childProcess)) return false;
    std::this_thread::sleep_for(std::chrono::milliseconds(250));
  }
  return false;
}

void closeProcessHandle(PROCESS_INFORMATION& processInfo) {
  if (processInfo.hProcess) {
    CloseHandle(processInfo.hProcess);
    processInfo.hProcess = nullptr;
  }
}

void showError(const std::wstring& message) {
  std::wcerr << L"[ERROR] " << message << L'\n';
  MessageBoxW(nullptr, message.c_str(), L"TPDD Launcher", MB_OK | MB_ICONERROR);
}
}  // namespace

int wmain() {
  SetConsoleOutputCP(CP_UTF8);

  WSADATA winsockData{};
  if (WSAStartup(MAKEWORD(2, 2), &winsockData) != 0) {
    showError(L"ネットワーク機能を初期化できませんでした。");
    return 1;
  }

  PROCESS_INFORMATION gatewayProcess{};
  PROCESS_INFORMATION editorProcess{};

  try {
    const Layout layout = resolveLayout(executableDirectory());

    std::wcout << L"Thinking Process Development Diagram Editor (TPDD)\n\n";

    if (!isPortOpen(kGatewayPort)) {
      if (!fs::exists(layout.gatewayExe)) {
        throw std::runtime_error(
          "LLM Gateway executable was not found. Run npm run build:release first."
        );
      }
      if (!fs::exists(layout.gatewayConfig)) {
        throw std::runtime_error("LLM Gateway configuration file was not found.");
      }

      std::wcout << L"[1/3] LLM Gatewayを起動しています...\n";
      gatewayProcess = startProcess(
        quote(layout.gatewayExe) + L" " + quote(layout.gatewayConfig),
        layout.gatewayDirectory
      );
      if (!waitForPort(kGatewayPort, gatewayProcess.hProcess)) {
        throw std::runtime_error("LLM Gatewayが30秒以内に起動しませんでした。");
      }
    } else {
      std::wcout << L"[1/3] LLM Gatewayは既に起動しています。\n";
    }

    if (!isPortOpen(kEditorPort)) {
      if (!fs::exists(layout.serverScript)) {
        throw std::runtime_error("TPDD distribution server script was not found.");
      }

      wchar_t nodePath[32768]{};
      if (SearchPathW(nullptr, L"node.exe", nullptr, 32768, nodePath, nullptr) == 0) {
        throw std::runtime_error("Node.jsが見つかりません。Node.js 18以降をインストールしてください。");
      }

      std::wcout << L"[2/3] TPDD配布サーバーを起動しています...\n";
      editorProcess = startProcess(
        quote(nodePath) + L" " + quote(layout.serverScript),
        layout.appDirectory
      );
      if (!waitForPort(kEditorPort, editorProcess.hProcess)) {
        throw std::runtime_error("TPDD配布サーバーが30秒以内に起動しませんでした。");
      }
    } else {
      std::wcout << L"[2/3] TPDD配布サーバーは既に起動しています。\n";
    }

    std::wcout << L"[3/3] ブラウザを開いています...\n";
    const auto browserResult = reinterpret_cast<INT_PTR>(ShellExecuteW(
      nullptr,
      L"open",
      L"http://127.0.0.1:3000",
      nullptr,
      nullptr,
      SW_SHOWNORMAL
    ));
    if (browserResult <= 32) {
      throw std::runtime_error("既定ブラウザを開けませんでした。");
    }

    std::wcout << L"\n起動が完了しました。\n"
               << L"Editor : http://127.0.0.1:3000\n"
               << L"Gateway: http://127.0.0.1:8765/v1\n";

    closeProcessHandle(gatewayProcess);
    closeProcessHandle(editorProcess);
    WSACleanup();
    return 0;
  } catch (const std::exception& error) {
    const std::string narrow = error.what();
    const int size = MultiByteToWideChar(CP_UTF8, 0, narrow.c_str(), -1, nullptr, 0);
    std::wstring wide(size > 0 ? static_cast<std::size_t>(size) : 0, L'\0');
    if (size > 1) {
      MultiByteToWideChar(CP_UTF8, 0, narrow.c_str(), -1, wide.data(), size);
      wide.resize(static_cast<std::size_t>(size - 1));
    }
    showError(wide.empty() ? L"起動中に不明なエラーが発生しました。" : wide);
    closeProcessHandle(gatewayProcess);
    closeProcessHandle(editorProcess);
    WSACleanup();
    return 1;
  }
}
