#include "manager/main_frame.hpp"
#include "manager/validation.hpp"
#include <wx/textdlg.h>

namespace manager {
namespace {
wxString ui(const char* text){return wxString::FromUTF8(text);}
class SecretDialog final:public wxDialog{
public:
  SecretDialog(wxWindow* parent):wxDialog(parent,wxID_ANY,ui("Credentialを登録"),wxDefaultPosition,wxSize(480,240)){
    auto* root=new wxBoxSizer(wxVERTICAL);first_=new wxTextCtrl(this,wxID_ANY,"",wxDefaultPosition,wxDefaultSize,wxTE_PASSWORD);second_=new wxTextCtrl(this,wxID_ANY,"",wxDefaultPosition,wxDefaultSize,wxTE_PASSWORD);
    root->Add(new wxStaticText(this,wxID_ANY,"Secret"),0,wxALL,8);root->Add(first_,0,wxEXPAND|wxLEFT|wxRIGHT,8);root->Add(new wxStaticText(this,wxID_ANY,ui("Secret（確認）")),0,wxALL,8);root->Add(second_,0,wxEXPAND|wxLEFT|wxRIGHT,8);root->Add(CreateSeparatedButtonSizer(wxOK|wxCANCEL),0,wxEXPAND|wxALL,8);SetSizer(root);
  }
  wxString secret()const{return first_->GetValue();}
  bool matches()const{return first_->GetValue()==second_->GetValue();}
private:wxTextCtrl* first_{};wxTextCtrl* second_{};
};
std::string utf8(const wxString& s){auto buffer=s.ToUTF8();return buffer?std::string(buffer.data(),buffer.length()):std::string();}
}
MainFrame::MainFrame():wxFrame(nullptr,wxID_ANY,"LLM Gateway Credential Manager",wxDefaultPosition,wxSize(760,480)),store_(make_credential_store()){
  auto* root=new wxBoxSizer(wxVERTICAL);auto* form=new wxFlexGridSizer(2,8,8);form->AddGrowableCol(1);form->Add(new wxStaticText(this,wxID_ANY,"Service Name"),0,wxALIGN_CENTER_VERTICAL);service_=new wxTextCtrl(this,wxID_ANY,"CloudLLM");form->Add(service_,1,wxEXPAND);form->Add(new wxStaticText(this,wxID_ANY,"Credential Identifier"),0,wxALIGN_CENTER_VERTICAL);username_=new wxTextCtrl(this,wxID_ANY,"openrouter|default");form->Add(username_,1,wxEXPAND);root->Add(form,0,wxEXPAND|wxALL,12);
  list_=new wxListCtrl(this,wxID_ANY,wxDefaultPosition,wxDefaultSize,wxLC_REPORT|wxLC_SINGLE_SEL);list_->AppendColumn("Service",wxLIST_FORMAT_LEFT,220);list_->AppendColumn("Credential Identifier",wxLIST_FORMAT_LEFT,320);list_->AppendColumn(ui("状態"),wxLIST_FORMAT_LEFT,120);root->Add(list_,1,wxEXPAND|wxLEFT|wxRIGHT,12);
  auto* buttons=new wxBoxSizer(wxHORIZONTAL);auto* save=new wxButton(this,wxID_SAVE,ui("登録 / 更新"));auto* del=new wxButton(this,wxID_DELETE,ui("削除"));auto* reload=new wxButton(this,wxID_REFRESH,ui("再読込"));buttons->Add(save,0,wxRIGHT,8);buttons->Add(del,0,wxRIGHT,8);buttons->Add(reload);root->Add(buttons,0,wxALL,12);SetSizer(root);
  save->Bind(wxEVT_BUTTON,&MainFrame::on_store,this);del->Bind(wxEVT_BUTTON,&MainFrame::on_delete,this);reload->Bind(wxEVT_BUTTON,[this](wxCommandEvent&){refresh();});service_->Bind(wxEVT_TEXT,[this](wxCommandEvent&){refresh();});refresh();
}
void MainFrame::refresh(){list_->DeleteAllItems();std::string reason,service=utf8(service_->GetValue());if(!valid_service_name(service,reason))return;try{for(const auto& item:store_->list(service)){auto row=list_->InsertItem(list_->GetItemCount(),wxString::FromUTF8(item.service));list_->SetItem(row,1,wxString::FromUTF8(item.username));list_->SetItem(row,2,ui("登録済み"));}}catch(...){SetStatusText(ui("Credential Storeを利用できません"));}}
void MainFrame::on_store(wxCommandEvent&){auto service=utf8(service_->GetValue()),username=utf8(username_->GetValue());std::string reason;if(!valid_service_name(service,reason)||!valid_username(username,reason)){wxMessageBox(wxString::FromUTF8(reason),ui("入力エラー"),wxOK|wxICON_ERROR,this);return;}SecretDialog dialog(this);if(dialog.ShowModal()!=wxID_OK)return;if(dialog.secret().empty()||!dialog.matches()){wxMessageBox(ui("Secretが空、または確認入力が一致しません。"),ui("入力エラー"),wxOK|wxICON_ERROR,this);return;}auto secret=dialog.secret();auto result=store_->store(service,username,{secret.wc_str(),secret.length()});secret.clear();if(result!=StoreResult::success){wxMessageBox(ui("Credential Storeへの保存に失敗しました。"),ui("エラー"),wxOK|wxICON_ERROR,this);return;}refresh();wxMessageBox(ui("Credentialを保存しました。"),ui("完了"),wxOK|wxICON_INFORMATION,this);}
void MainFrame::on_delete(wxCommandEvent&){auto selected=list_->GetNextItem(-1,wxLIST_NEXT_ALL,wxLIST_STATE_SELECTED);auto service=utf8(service_->GetValue()),username=selected>=0?utf8(list_->GetItemText(selected,1)):utf8(username_->GetValue());if(username.empty())return;if(wxMessageBox(ui("Credentialを削除しますか？\n\n")+wxString::FromUTF8(service+" / "+username),ui("削除確認"),wxYES_NO|wxNO_DEFAULT|wxICON_WARNING,this)!=wxYES)return;auto result=store_->remove(service,username);if(result!=StoreResult::success&&result!=StoreResult::not_found){wxMessageBox(ui("Credentialの削除に失敗しました。"),ui("エラー"),wxOK|wxICON_ERROR,this);return;}refresh();}
}
