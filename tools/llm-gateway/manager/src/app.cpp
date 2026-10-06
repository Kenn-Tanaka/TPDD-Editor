#include "manager/main_frame.hpp"
#include <wx/wx.h>
class ManagerApp final:public wxApp{public:bool OnInit()override{auto* frame=new manager::MainFrame();frame->Show();return true;}};
wxIMPLEMENT_APP(ManagerApp);
