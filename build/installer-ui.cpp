#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <windowsx.h>
#include <dwmapi.h>
#include <shellapi.h>
#include <shobjidl.h>
#include <shlwapi.h>
#include <gdiplus.h>
#include <tlhelp32.h>
#include <algorithm>
#include <cstdint>
#include <string>
#include <vector>

#ifndef _M_IX86
#error The NSIS installer uses a 32-bit host.
#endif
#pragma comment(linker, "/export:NovaShowSetup=_NovaShowSetup@36")

namespace {
using namespace Gdiplus;

constexpr COLORREF Canvas = RGB(15, 16, 20);
constexpr ARGB Panel = 0xff16181f;
constexpr COLORREF Field = RGB(26, 28, 35);
constexpr COLORREF Border = RGB(48, 51, 62);
constexpr COLORREF Text = RGB(244, 245, 250);
constexpr COLORREF Muted = RGB(166, 173, 189);
constexpr COLORREF Blue = RGB(55, 92, 213);
constexpr int Width = 640, Height = 344, Sidebar = 176, Content = 204, ContentWidth = 408;
constexpr UINT_PTR Timer = 1;
// The NSIS engine returns this after registering a manual installation.
constexpr DWORD ManualInstallComplete = 73;
constexpr wchar_t ClassName[] = L"NOVA.Setup.Window";
enum Control { Close = 100, Browse, Scope, Primary, Finish };
enum class Page { Folder, Installing, Ready, Failed };

HINSTANCE module;

bool appIsRunning(const std::wstring &filename) {
    const HANDLE processes = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (processes == INVALID_HANDLE_VALUE) return false;
    PROCESSENTRY32W entry{sizeof(entry)};
    bool running = false;
    for (BOOL more = Process32FirstW(processes, &entry); more; more = Process32NextW(processes, &entry)) {
        if (_wcsicmp(entry.szExeFile, filename.c_str()) == 0) {
            running = true;
            break;
        }
    }
    CloseHandle(processes);
    return running;
}

struct Setup {
    HWND window{}, path{}, browse{}, scope{}, close{}, primary{}, finish{};
    HFONT font{}, title{}, label{};
    HBRUSH field{};
    HANDLE installProcess{};
    std::wstring installer, product, userPath, machinePath, selectedPath, launchPath, pathError;
    Image *logo{};
    Page page{Page::Folder};
    UINT dpi{96};
    bool russian{}, allUsers{}, animate{}, acrylic{};
    int phase{}, result{-1};

    const wchar_t *t(const wchar_t *english, const wchar_t *russianText) const {
        return russian ? russianText : english;
    }
    int px(int value) const { return MulDiv(value, dpi, 96); }
    RECT rect(int x, int y, int width, int height) const {
        return {px(x), px(y), px(x + width), px(y + height)};
    }
    HFONT makeFont(int size, int weight) const {
        return CreateFontW(-px(size), 0, 0, 0, weight, 0, 0, 0, DEFAULT_CHARSET,
                           OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
                           DEFAULT_PITCH, L"Segoe UI");
    }
    HWND button(int id, int x, int y, int width, int height) const {
        return CreateWindowW(L"BUTTON", L"", WS_CHILD | WS_TABSTOP | BS_OWNERDRAW,
                             px(x), px(y), px(width), px(height), window,
                             reinterpret_cast<HMENU>(static_cast<INT_PTR>(id)), module, nullptr);
    }
    std::wstring pathText() const {
        std::wstring value(static_cast<size_t>(GetWindowTextLengthW(path)) + 1, L'\0');
        value.resize(GetWindowTextW(path, value.data(), static_cast<int>(value.size())));
        return value;
    }
    const std::wstring &defaultPath() const { return allUsers ? machinePath : userPath; }

    void createControls();
    void render(HDC dc, bool glass = false) const;
    void paint(HDC dc) const;
    void drawButton(const DRAWITEMSTRUCT &buttonInfo) const;
    void showPage(Page next);
    void chooseFolder();
    void install();
    void poll();
    void command(int id);
};

bool applyAcrylic(HWND window, int sidebarWidth) {
    HIGHCONTRASTW contrast{sizeof(contrast)};
    if (SystemParametersInfoW(SPI_GETHIGHCONTRAST, sizeof(contrast), &contrast, 0) &&
        (contrast.dwFlags & HCF_HIGHCONTRASTON)) return false;

    DWORD transparency = 1, size = sizeof(transparency);
    RegGetValueW(HKEY_CURRENT_USER, L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
                 L"EnableTransparency", RRF_RT_REG_DWORD, nullptr, &transparency, &size);
    if (!transparency) return false;

    const BOOL dark = TRUE;
    DwmSetWindowAttribute(window, DWMWA_USE_IMMERSIVE_DARK_MODE, &dark, sizeof(dark));
    const DWM_SYSTEMBACKDROP_TYPE backdrop = DWMSBT_TRANSIENTWINDOW;
    if (FAILED(DwmSetWindowAttribute(window, DWMWA_SYSTEMBACKDROP_TYPE, &backdrop, sizeof(backdrop)))) return false;
    const MARGINS margins{sidebarWidth, 0, 0, 0};
    if (SUCCEEDED(DwmExtendFrameIntoClientArea(window, &margins))) return true;

    const DWM_SYSTEMBACKDROP_TYPE none = DWMSBT_NONE;
    DwmSetWindowAttribute(window, DWMWA_SYSTEMBACKDROP_TYPE, &none, sizeof(none));
    return false;
}

void roundFill(Graphics &graphics, const RECT &bounds, int radius, COLORREF color, COLORREF outline) {
    const REAL x = static_cast<REAL>(bounds.left), y = static_cast<REAL>(bounds.top);
    const REAL w = static_cast<REAL>(bounds.right - bounds.left - 1);
    const REAL h = static_cast<REAL>(bounds.bottom - bounds.top - 1);
    const REAL d = static_cast<REAL>(radius * 2);
    GraphicsPath shape;
    shape.AddArc(x, y, d, d, 180, 90);
    shape.AddArc(x + w - d, y, d, d, 270, 90);
    shape.AddArc(x + w - d, y + h - d, d, d, 0, 90);
    shape.AddArc(x, y + h - d, d, d, 90, 90);
    shape.CloseFigure();
    SolidBrush fill(Color(GetRValue(color), GetGValue(color), GetBValue(color)));
    Pen border(Color(GetRValue(outline), GetGValue(outline), GetBValue(outline)));
    graphics.FillPath(&fill, &shape);
    graphics.DrawPath(&border, &shape);
}

void write(HDC dc, RECT box, HFONT font, COLORREF color, const wchar_t *text, UINT flags) {
    const HGDIOBJ previous = SelectObject(dc, font);
    SetBkMode(dc, TRANSPARENT);
    SetTextColor(dc, color);
    DrawTextW(dc, text, -1, &box, flags | DT_NOPREFIX);
    SelectObject(dc, previous);
}

void Setup::createControls() {
    font = makeFont(14, FW_NORMAL);
    title = makeFont(28, FW_SEMIBOLD);
    label = makeFont(14, FW_SEMIBOLD);
    field = CreateSolidBrush(Field);
    close = button(Close, 592, 16, 32, 32);
    SetWindowTextW(close, t(L"Close", L"Закрыть"));
    path = CreateWindowW(L"EDIT", defaultPath().c_str(), WS_CHILD | WS_TABSTOP | ES_AUTOHSCROLL,
                         px(Content + 12), px(140), px(296), px(20), window,
                         nullptr, module, nullptr);
    SendMessageW(path, WM_SETFONT, reinterpret_cast<WPARAM>(font), FALSE);
    SendMessageW(path, EM_SETLIMITTEXT, 240, 0);
    browse = button(Browse, 532, 128, 80, 44);
    SetWindowTextW(browse, t(L"Browse", L"Обзор"));
    scope = button(Scope, Content, 188, 188, 40);
    primary = button(Primary, 464, 272, 148, 44);
    finish = button(Finish, 360, 272, 92, 44);
    SetWindowTextW(finish, t(L"Close", L"Закрыть"));
    showPage(Page::Folder);
}

void Setup::render(HDC dc, bool glass) const {
    const RECT client = rect(0, 0, Width, Height);
    HBRUSH background = CreateSolidBrush(Canvas);
    FillRect(dc, &client, background);
    DeleteObject(background);
    {
        Graphics graphics(dc);
        graphics.SetSmoothingMode(SmoothingModeAntiAlias);
        graphics.SetInterpolationMode(InterpolationModeHighQualityBicubic);
        const Rect panel(0, 0, px(Sidebar), px(Height));
        SolidBrush fill(glass ? Color(0, 0, 0) : Color(Panel));
        graphics.FillRectangle(&fill, panel);
        if (logo && logo->GetLastStatus() == Ok) graphics.DrawImage(logo, Rect(px(24), px(40), px(128), px(34)));
        if (page == Page::Folder) {
            roundFill(graphics, rect(Content, 128, 316, 44), px(10), Field, GetFocus() == path ? Blue : Border);
        } else if (page == Page::Installing) {
            roundFill(graphics, rect(Content, 176, ContentWidth, 6), px(3), Field, Field);
            const int left = std::max(0, phase - 104);
            const int right = std::min(phase + (animate ? 0 : 104), ContentWidth);
            if (right - left >= 8) roundFill(graphics, rect(Content + left, 176, right - left, 6), px(3), Blue, Blue);
        }
    }

    const wchar_t *heading = t(L"Installation folder", L"Папка установки");
    if (page == Page::Installing) {
        heading = t(L"Installing…", L"Установка…");
    } else if (page == Page::Ready) {
        heading = t(L"Ready", L"Готово");
    } else if (page == Page::Failed) {
        heading = t(L"Setup stopped", L"Установка прервалась");
        write(dc, rect(Content, 168, ContentWidth, 52), font, Muted,
              t(L"Check the installation folder.", L"Проверьте папку установки"), DT_WORDBREAK);
    }
    const int titleY = page == Page::Folder ? 72 : 116;
    write(dc, rect(Content, titleY, ContentWidth, 40), title, Text, heading, DT_SINGLELINE | DT_VCENTER);
    if (page == Page::Folder && !pathError.empty()) {
        write(dc, rect(Content, 236, ContentWidth, 24), font, RGB(255, 164, 157), pathError.c_str(), DT_SINGLELINE);
    }
}

void Setup::paint(HDC dc) const {
    const int width = px(Width), height = px(Height);
    BITMAPINFO info{};
    info.bmiHeader.biSize = sizeof(info.bmiHeader);
    info.bmiHeader.biWidth = width;
    info.bmiHeader.biHeight = -height;
    info.bmiHeader.biPlanes = 1;
    info.bmiHeader.biBitCount = 32;
    void *bits{};
    HDC buffer = CreateCompatibleDC(dc);
    HBITMAP surface = CreateDIBSection(dc, &info, DIB_RGB_COLORS, &bits, nullptr, 0);
    if (!buffer || !surface) {
        if (surface) DeleteObject(surface);
        if (buffer) DeleteDC(buffer);
        render(dc);
        return;
    }
    HGDIOBJ previous = SelectObject(buffer, surface);
    render(buffer, acrylic);
    if (acrylic) {
        GdiFlush();
        auto *pixels = static_cast<std::uint32_t *>(bits);
        const int sidebarWidth = px(Sidebar);
        for (int y = 0; y < height; ++y) {
            for (int x = 0; x < sidebarWidth; ++x) {
                auto &pixel = pixels[y * width + x];
                // Composite the mark over the same dark tint as NOVA's glass menus.
                const auto red = (pixel >> 16) & 255, green = (pixel >> 8) & 255, blue = pixel & 255;
                const auto markAlpha = std::max({red, green, blue});
                const auto tintAlpha = 158 * (255 - markAlpha) / 255;
                pixel = ((markAlpha + tintAlpha) << 24) | ((red + 12 * tintAlpha / 255) << 16) |
                        ((green + 13 * tintAlpha / 255) << 8) | (blue + 16 * tintAlpha / 255);
            }
        }
    }
    BitBlt(dc, 0, 0, width, height, buffer, 0, 0, SRCCOPY);
    SelectObject(buffer, previous);
    DeleteObject(surface);
    DeleteDC(buffer);
}

void Setup::drawButton(const DRAWITEMSTRUCT &info) const {
    WCHAR text[64];
    const bool main = info.CtlID == Primary;
    const bool focused = (info.itemState & ODS_FOCUS) != 0;
    const bool pushed = (info.itemState & ODS_SELECTED) != 0;
    GetWindowTextW(info.hwndItem, text, ARRAYSIZE(text));
    {
        Graphics graphics(info.hDC);
        graphics.SetSmoothingMode(SmoothingModeAntiAlias);
        graphics.Clear(Color(15, 16, 20));
        if (info.CtlID == Close) {
            const REAL x = static_cast<REAL>(info.rcItem.right) / 2;
            const REAL y = static_cast<REAL>(info.rcItem.bottom) / 2;
            const REAL span = static_cast<REAL>(px(5));
            if (focused || pushed) roundFill(graphics, info.rcItem, px(10), Field, Border);
            Pen cross(Color(206, 211, 226), static_cast<REAL>(px(2)));
            graphics.DrawLine(&cross, x - span, y - span, x + span, y + span);
            graphics.DrawLine(&cross, x - span, y + span, x + span, y - span);
            return;
        }
        const COLORREF color = main ? (pushed ? RGB(48, 79, 186) : Blue) : (pushed ? Border : Field);
        roundFill(graphics, info.rcItem, px(12), color, focused ? RGB(147, 174, 255) : (main ? color : Border));
    }
    write(info.hDC, info.rcItem, label, Text, text, DT_CENTER | DT_SINGLELINE | DT_VCENTER);
}

void Setup::showPage(Page next) {
    page = next;
    const bool folder = page == Page::Folder;
    const bool busy = page == Page::Installing;
    ShowWindow(path, folder ? SW_SHOW : SW_HIDE);
    ShowWindow(browse, folder ? SW_SHOW : SW_HIDE);
    ShowWindow(scope, folder && !machinePath.empty() ? SW_SHOW : SW_HIDE);
    ShowWindow(close, busy || page == Page::Ready ? SW_HIDE : SW_SHOW);
    ShowWindow(primary, busy ? SW_HIDE : SW_SHOW);
    ShowWindow(finish, page == Page::Ready ? SW_SHOW : SW_HIDE);
    SetWindowTextW(scope, allUsers ? t(L"All users  ▾", L"Для всех  ▾") : t(L"Only me  ▾", L"Только для меня  ▾"));
    SetWindowTextW(primary, page == Page::Ready ? t(L"Open", L"Открыть")
                : page == Page::Failed ? t(L"Try again", L"Повторить") : t(L"Install", L"Установить"));
    InvalidateRect(window, nullptr, FALSE);
    if (!busy) SetFocus(primary);
}

void Setup::chooseFolder() {
    IFileOpenDialog *dialog{};
    if (FAILED(CoCreateInstance(CLSID_FileOpenDialog, nullptr, CLSCTX_INPROC_SERVER,
                                IID_PPV_ARGS(&dialog)))) return;
    dialog->SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
    dialog->SetTitle(t(L"Choose the installation folder", L"Выберите папку установки"));
    IShellItem *item{};
    if (SUCCEEDED(SHCreateItemFromParsingName(pathText().c_str(), nullptr, IID_PPV_ARGS(&item)))) {
        dialog->SetFolder(item);
        item->Release();
    }
    if (SUCCEEDED(dialog->Show(window)) && SUCCEEDED(dialog->GetResult(&item))) {
        PWSTR folder{};
        if (SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH, &folder))) {
            std::wstring location(folder);
            if (_wcsicmp(PathFindFileNameW(location.c_str()), product.c_str()) != 0) {
                if (location.back() != L'\\') location += L'\\';
                location += product;
            }
            SetWindowTextW(path, location.c_str());
            CoTaskMemFree(folder);
        }
        item->Release();
    }
    dialog->Release();
}

void Setup::install() {
    const std::wstring typed = pathText();
    wchar_t absolute[MAX_PATH];
    const DWORD length = GetFullPathNameW(typed.c_str(), ARRAYSIZE(absolute), absolute, nullptr);
    const bool fullPath = typed.size() > 2 && ((typed[1] == L':' && (typed[2] == L'\\' || typed[2] == L'/')) ||
                        typed.compare(0, 2, L"\\\\") == 0);
    if (!fullPath || typed.find_first_of(L"<>\"'|?*") != std::wstring::npos ||
        !length || length >= ARRAYSIZE(absolute)) {
        SetFocus(path);
        SendMessageW(path, EM_SETSEL, 0, -1);
        pathError = t(L"Enter a full path or select a folder.", L"Укажите полный путь или выберите папку.");
        InvalidateRect(window, nullptr, FALSE);
        return;
    }
    PathRemoveBackslashW(absolute);
    selectedPath = absolute;
    if (_wcsicmp(selectedPath.c_str(), defaultPath().c_str()) != 0 &&
        _wcsicmp(PathFindFileNameW(selectedPath.c_str()), product.c_str()) != 0) {
        if (selectedPath.back() != L'\\') selectedPath += L'\\';
        selectedPath += product;
    }
    launchPath = selectedPath + L"\\" + product + L".exe";
    if (launchPath.size() >= MAX_PATH) {
        SetFocus(path);
        SendMessageW(path, EM_SETSEL, 0, -1);
        pathError = t(L"Choose a shorter installation path.", L"Выберите более короткий путь установки.");
        InvalidateRect(window, nullptr, FALSE);
        return;
    }
    if (appIsRunning(product + L".exe")) {
        pathError = t(L"Close NOVA before installing.", L"Закройте NOVA перед установкой.");
        InvalidateRect(window, nullptr, FALSE);
        return;
    }
    const std::wstring commandLine = L"\"" + installer + L"\" /S /nova-setup-ui " +
                                     (allUsers ? L"/allusers" : L"/currentuser") + L" /D=" + selectedPath;
    std::vector<wchar_t> command(commandLine.c_str(), commandLine.c_str() + commandLine.size() + 1);
    STARTUPINFOW startup{sizeof(startup)};
    PROCESS_INFORMATION child{};
    if (!CreateProcessW(installer.c_str(), command.data(), nullptr, nullptr, FALSE, 0, nullptr, nullptr,
                        &startup, &child)) {
        showPage(Page::Failed);
        return;
    }
    CloseHandle(child.hThread);
    installProcess = child.hProcess;
    phase = 0;
    showPage(Page::Installing);
    SetTimer(window, Timer, animate ? 24 : 120, nullptr);
}

void Setup::poll() {
    if (WaitForSingleObject(installProcess, 0) == WAIT_TIMEOUT) {
        if (animate) {
            phase = (phase + 7) % (ContentWidth + 104);
            InvalidateRect(window, nullptr, FALSE);
        }
        return;
    }
    DWORD code = 1;
    GetExitCodeProcess(installProcess, &code);
    CloseHandle(installProcess);
    installProcess = nullptr;
    KillTimer(window, Timer);
    const DWORD installed = GetFileAttributesW(launchPath.c_str());
    showPage(code == ManualInstallComplete && installed != INVALID_FILE_ATTRIBUTES && !(installed & FILE_ATTRIBUTE_DIRECTORY)
             ? Page::Ready : Page::Failed);
}

void Setup::command(int id) {
    if (id == Browse && page == Page::Folder) chooseFolder();
    else if (id == Scope && page == Page::Folder && !machinePath.empty()) {
        allUsers = !allUsers;
        SetWindowTextW(path, defaultPath().c_str());
        showPage(Page::Folder);
        SetFocus(scope);
    } else if (id == Primary) {
        if (page == Page::Folder) install();
        else if (page == Page::Failed) showPage(Page::Folder);
        else if (page == Page::Ready) {
            result = 1;
            DestroyWindow(window);
        }
    } else if (id == Close || id == Finish) {
        SendMessageW(window, WM_CLOSE, 0, 0);
    }
}

LRESULT CALLBACK windowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    Setup *setup = reinterpret_cast<Setup *>(GetWindowLongPtrW(window, GWLP_USERDATA));
    if (message == WM_NCCREATE) {
        setup = static_cast<Setup *>(reinterpret_cast<CREATESTRUCTW *>(lParam)->lpCreateParams);
        setup->window = window;
        SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(setup));
    }
    if (!setup) return DefWindowProcW(window, message, wParam, lParam);
    switch (message) {
        case WM_NCCALCSIZE: return 0;
        case WM_CREATE: setup->createControls(); return 0;
        case WM_COMMAND:
            if (reinterpret_cast<HWND>(lParam) == setup->path) {
                if (HIWORD(wParam) == EN_CHANGE) setup->pathError.clear();
                InvalidateRect(window, nullptr, FALSE);
            }
            else setup->command(LOWORD(wParam));
            return 0;
        case WM_DRAWITEM: setup->drawButton(*reinterpret_cast<DRAWITEMSTRUCT *>(lParam)); return TRUE;
        case WM_CTLCOLOREDIT:
            SetTextColor(reinterpret_cast<HDC>(wParam), Text);
            SetBkColor(reinterpret_cast<HDC>(wParam), Field);
            return reinterpret_cast<LRESULT>(setup->field);
        case WM_SETFOCUS: InvalidateRect(window, nullptr, FALSE); return 0;
        case WM_TIMER: setup->poll(); return 0;
        case WM_ERASEBKGND: return 1;
        case WM_PRINTCLIENT: setup->render(reinterpret_cast<HDC>(wParam)); return 0;
        case WM_PAINT: {
            PAINTSTRUCT paint;
            HDC dc = BeginPaint(window, &paint);
            setup->paint(dc);
            EndPaint(window, &paint);
            return 0;
        }
        case WM_NCHITTEST: {
            POINT point{GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam)};
            ScreenToClient(window, &point);
            if (point.y >= 0 && point.y < setup->px(56) && point.x < setup->px(592)) return HTCAPTION;
            break;
        }
        case WM_CLOSE:
            if (setup->page != Page::Installing) {
                setup->result = setup->page == Page::Ready ? 0 : -1;
                DestroyWindow(window);
            }
            return 0;
        case WM_DESTROY: return 0;
    }
    return DefWindowProcW(window, message, wParam, lParam);
}
} // namespace

extern "C" int WINAPI NovaShowSetup(const wchar_t *installer, const wchar_t *product, const wchar_t *userPath,
                                     const wchar_t *machinePath, int language, int allUsers,
                                     const wchar_t *logoPath, wchar_t *launch, int launchCapacity) {
    if (launchCapacity <= 0) return -1;
    launch[0] = L'\0';
    Setup setup;
    setup.installer = installer;
    setup.product = product;
    setup.userPath = userPath;
    setup.machinePath = machinePath;
    setup.russian = PRIMARYLANGID(static_cast<LANGID>(language)) == LANG_RUSSIAN;
    setup.allUsers = allUsers && !setup.machinePath.empty();
    setup.dpi = GetDpiForSystem();
    BOOL animation = TRUE;
    SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION, 0, &animation, 0);
    setup.animate = animation != FALSE;

    const std::wstring mutexName = L"Local\\NOVA.Setup." + setup.product;
    HANDLE mutex = CreateMutexW(nullptr, FALSE, mutexName.c_str());
    if (!mutex || GetLastError() == ERROR_ALREADY_EXISTS) {
        if (mutex) CloseHandle(mutex);
        return -1;
    }
    const HRESULT com = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    ULONG_PTR gdi{};
    GdiplusStartupInput gdiInput;
    if (GdiplusStartup(&gdi, &gdiInput, nullptr) != Ok) {
        if (SUCCEEDED(com)) CoUninitialize();
        CloseHandle(mutex);
        return -1;
    }
    setup.logo = Image::FromFile(logoPath);
    WNDCLASSEXW definition{sizeof(definition)};
    definition.lpfnWndProc = windowProc;
    definition.hInstance = module;
    definition.lpszClassName = ClassName;
    definition.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    ExtractIconExW(installer, 0, &definition.hIcon, &definition.hIconSm, 1);
    RegisterClassExW(&definition);
    RECT area{};
    SystemParametersInfoW(SPI_GETWORKAREA, 0, &area, 0);
    const int width = setup.px(Width), height = setup.px(Height);
    HWND window = CreateWindowExW(WS_EX_APPWINDOW | WS_EX_CONTROLPARENT, ClassName, L"NOVA Setup",
                                  WS_POPUP | WS_SYSMENU | WS_THICKFRAME | WS_CLIPCHILDREN,
                                  area.left + (area.right - area.left - width) / 2,
                                  area.top + (area.bottom - area.top - height) / 2,
                                  width, height, nullptr, nullptr, module, &setup);
    if (window) {
        const DWM_WINDOW_CORNER_PREFERENCE corner = DWMWCP_ROUND;
        DwmSetWindowAttribute(window, DWMWA_WINDOW_CORNER_PREFERENCE, &corner, sizeof(corner));
        setup.acrylic = applyAcrylic(window, setup.px(Sidebar));
        if (!setup.acrylic) {
            HRGN shape = CreateRoundRectRgn(0, 0, width + 1, height + 1, setup.px(24), setup.px(24));
            if (shape && !SetWindowRgn(window, shape, FALSE)) DeleteObject(shape);
        }
        const bool testing = wcsstr(GetCommandLineW(), L"--test-profile=") != nullptr;
        ShowWindow(window, testing ? SW_SHOWNOACTIVATE : SW_SHOW);
        if (!testing) SetFocus(setup.primary);
        UpdateWindow(window);
        MSG message;
        while (IsWindow(window) && GetMessageW(&message, nullptr, 0, 0) > 0) {
            if (message.message == WM_KEYDOWN && message.wParam == VK_ESCAPE) {
                SendMessageW(window, WM_CLOSE, 0, 0);
            } else if (message.message == WM_KEYDOWN && message.wParam == VK_RETURN &&
                       (GetFocus() == setup.path || GetFocus() == setup.primary)) {
                setup.command(Primary);
            } else if (!IsDialogMessageW(window, &message)) {
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }
    }
    if (setup.result == 1 && setup.launchPath.size() < static_cast<size_t>(launchCapacity)) {
        lstrcpynW(launch, setup.launchPath.c_str(), launchCapacity);
    }
    DeleteObject(setup.field);
    DeleteObject(setup.font);
    DeleteObject(setup.title);
    DeleteObject(setup.label);
    UnregisterClassW(ClassName, module);
    if (definition.hIcon) DestroyIcon(definition.hIcon);
    if (definition.hIconSm) DestroyIcon(definition.hIconSm);
    delete setup.logo;
    GdiplusShutdown(gdi);
    if (SUCCEEDED(com)) CoUninitialize();
    CloseHandle(mutex);
    return setup.result;
}

BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) module = instance;
    return TRUE;
}
