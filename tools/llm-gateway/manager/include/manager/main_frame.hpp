#pragma once
#include "manager/credential_store.hpp"
#include <wx/wx.h>
#include <wx/listctrl.h>
#include <memory>
namespace manager {
class MainFrame final:public wxFrame {
public:
  MainFrame();
private:
  void refresh();
  void on_store(wxCommandEvent&);
  void on_delete(wxCommandEvent&);
  wxTextCtrl* service_{}; wxTextCtrl* username_{}; wxListCtrl* list_{};
  std::unique_ptr<ICredentialStore> store_;
};
}
