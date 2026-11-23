#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#define GDIPVER 0x0110
#include <windows.h>
#include <windowsx.h>
#include <dwmapi.h>
#include <commctrl.h>
#include <shellapi.h>
#include <shobjidl.h>
#include <shlwapi.h>
#include <gdiplus.h>
#include <tlhelp32.h>
#include <algorithm>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>
#include "installer-update.h"

#ifndef _M_IX86
#error The NSIS installer uses a 32-bit host.
#endif
#pragma comment(linker, "/export:NovaShowSetup=_NovaShowSetup@40")

namespace {
using namespace Gdiplus;

constexpr COLORREF Canvas = RGB(15, 16, 20);
constexpr COLORREF Header = RGB(25, 27, 33);
constexpr COLORREF Field = RGB(26, 28, 35);
constexpr COLORREF Border = RGB(48, 51, 62);
constexpr COLORREF Text = RGB(244, 245, 250);
constexpr COLORREF Muted = RGB(166, 173, 189);
constexpr COLORREF Blue = RGB(65, 101, 230);
constexpr int Width = 448, Height = 256, HeaderHeight = 44, Margin = 24;
constexpr int LauncherWidth = 768, LauncherHeight = 456, InstallPane = 352;
constexpr DWORD ExpandTime = 340;
constexpr DWORD RevealTime = 280;
constexpr UINT_PTR Timer = 1, LayoutTimer = 2;
// The NSIS engine returns this after registering a manual installation.
constexpr DWORD ManualInstallComplete = 73;
constexpr wchar_t ClassName[] = L"NOVA.Setup.Window";
enum Control { Close = 100, Browse, Scope, Primary, Minimize, Releases };
enum class Page { Connecting, Downloading, Folder, Installing, Completing, Ready, Failed };

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
    HWND window{}, path{}, browse{}, scope{}, close{}, primary{}, minimize{}, releases{}, hotCaption{};
    HFONT font{}, title{}, label{}, pathFont{};
    HBRUSH field{};
    HANDLE installProcess{}, handoffThread{};
    SetupUpdate update;
    ReleaseFeed feed;
    std::wstring installer, product, userPath, machinePath, selectedPath, launchPath, pathError, testProfile;
    Image *logo{};
    std::unique_ptr<Bitmap> frost;
    Page page{Page::Folder};
    UINT dpi{96};
    bool russian{}, allUsers{}, animate{}, acrylic{}, checkRelease{}, updateUnavailable{};
    bool canExpand{}, expanded{}, initialExpanded{};
    ULONGLONG pageStart{}, expandStart{}, shownAt{};
    int viewWidth{Width}, viewHeight{Height};
    float expansion{}, fromExpansion{}, targetExpansion{};
    RECT workArea{};
    POINT resizeCenter{};
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
    bool busy() const { return page == Page::Installing || page == Page::Completing; }
    bool updating() const { return page == Page::Connecting || page == Page::Downloading; }
    std::wstring status() const {
        if (page == Page::Connecting) return t(L"Connecting to server…", L"Подключение к серверу…");
        if (page == Page::Downloading) {
            return t(L"Downloading update · ", L"Скачиваем обновление · ") + std::to_wstring(update.downloadPercent.load()) + L"%";
        }
        return t(L"Installing…", L"Установка…");
    }
    float reveal() const {
        return std::min(1.0f, static_cast<float>(GetTickCount64() - pageStart) / RevealTime);
    }

    void createControls();
    void layoutControls() const;
    void requestLauncherSize(bool open);
    void resizeLauncher();
    void pollLayout();
    void captureFrost();
    void render(HDC dc, bool glass = false) const;
    void drawFeed(HDC dc) const;
    void drawCaptionButton(Graphics &graphics, HWND button, RECT bounds) const;
    void paint(HDC dc) const;
    void drawButton(const DRAWITEMSTRUCT &buttonInfo) const;
    void showPage(Page next);
    void chooseFolder();
    void install();
    bool openUpdate();
    void poll();
    void command(int id);
};

bool applyAcrylic(HWND window, int headerHeight) {
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
    const MARGINS margins{0, 0, headerHeight, 0};
    if (SUCCEEDED(DwmExtendFrameIntoClientArea(window, &margins))) return true;

    const DWM_SYSTEMBACKDROP_TYPE none = DWMSBT_NONE;
    DwmSetWindowAttribute(window, DWMWA_SYSTEMBACKDROP_TYPE, &none, sizeof(none));
    return false;
}

Color colorref(COLORREF value) {
    return Color(GetRValue(value), GetGValue(value), GetBValue(value));
}

COLORREF blend(COLORREF from, COLORREF to, float amount) {
    return RGB(static_cast<BYTE>(GetRValue(from) + (GetRValue(to) - GetRValue(from)) * amount),
               static_cast<BYTE>(GetGValue(from) + (GetGValue(to) - GetGValue(from)) * amount),
               static_cast<BYTE>(GetBValue(from) + (GetBValue(to) - GetBValue(from)) * amount));
}

struct PaintBuffer {
    HDC dc{};
    HBITMAP bitmap{};
    HGDIOBJ previous{};
    void *bits{};

    PaintBuffer(HDC target, int width, int height) {
        BITMAPINFO info{};
        info.bmiHeader.biSize = sizeof(info.bmiHeader);
        info.bmiHeader.biWidth = width;
        info.bmiHeader.biHeight = -height;
        info.bmiHeader.biPlanes = 1;
        info.bmiHeader.biBitCount = 32;
        dc = CreateCompatibleDC(target);
        bitmap = CreateDIBSection(target, &info, DIB_RGB_COLORS, &bits, nullptr, 0);
        if (dc && bitmap) previous = SelectObject(dc, bitmap);
    }

    ~PaintBuffer() {
        if (previous) SelectObject(dc, previous);
        if (bitmap) DeleteObject(bitmap);
        if (dc) DeleteDC(dc);
    }

    PaintBuffer(const PaintBuffer &) = delete;
    PaintBuffer &operator=(const PaintBuffer &) = delete;
};

std::uint32_t glassPixel(std::uint32_t red, std::uint32_t green, std::uint32_t blue, std::uint32_t alpha) {
    const auto tint = 164 * (255 - alpha) / 255;
    return ((alpha + tint) << 24) | ((red + 20 * tint / 255) << 16) |
           ((green + 22 * tint / 255) << 8) | (blue + 28 * tint / 255);
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
    SolidBrush fill(colorref(color));
    Pen border(colorref(outline));
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

RECT childBounds(HWND child, HWND parent) {
    RECT bounds{};
    GetWindowRect(child, &bounds);
    MapWindowPoints(nullptr, parent, reinterpret_cast<POINT *>(&bounds), 2);
    return bounds;
}

LRESULT CALLBACK captionButtonProc(HWND button, UINT message, WPARAM wParam, LPARAM lParam, UINT_PTR id, DWORD_PTR data) {
    auto &setup = *reinterpret_cast<Setup *>(data);
    const auto repaint = [&] {
        const auto bounds = childBounds(button, setup.window);
        RedrawWindow(setup.window, &bounds, nullptr, RDW_INVALIDATE | RDW_NOCHILDREN);
    };
    switch (message) {
        case WM_PAINT: ValidateRect(button, nullptr); repaint(); return 0;
        case WM_ERASEBKGND: return 1;
        case WM_PRINT:
        case WM_PRINTCLIENT: return 0;
        case WM_MOUSEMOVE:
            if (setup.hotCaption != button) {
                setup.hotCaption = button;
                TRACKMOUSEEVENT tracking{sizeof(tracking), TME_LEAVE, button, 0};
                TrackMouseEvent(&tracking);
                repaint();
            }
            break;
        case WM_MOUSELEAVE:
            if (setup.hotCaption == button) setup.hotCaption = nullptr;
            repaint();
            break;
        case WM_NCDESTROY: RemoveWindowSubclass(button, captionButtonProc, id); break;
    }
    return DefSubclassProc(button, message, wParam, lParam);
}

void Setup::createControls() {
    font = makeFont(14, FW_NORMAL);
    title = makeFont(20, FW_SEMIBOLD);
    label = makeFont(14, FW_SEMIBOLD);
    pathFont = makeFont(13, FW_NORMAL);
    field = CreateSolidBrush(Field);
    minimize = button(Minimize, viewWidth - 76, 6, 32, 32);
    SetWindowTextW(minimize, t(L"Minimize", L"Свернуть"));
    close = button(Close, viewWidth - 40, 6, 32, 32);
    SetWindowTextW(close, t(L"Close", L"Закрыть"));
    SetWindowSubclass(minimize, captionButtonProc, Minimize, reinterpret_cast<DWORD_PTR>(this));
    SetWindowSubclass(close, captionButtonProc, Close, reinterpret_cast<DWORD_PTR>(this));
    path = CreateWindowW(L"EDIT", defaultPath().c_str(), WS_CHILD | WS_TABSTOP | ES_AUTOHSCROLL,
                         px(Margin + 12), px(116), px(288), px(20), window,
                         nullptr, module, nullptr);
    SendMessageW(path, WM_SETFONT, reinterpret_cast<WPARAM>(pathFont), FALSE);
    SendMessageW(path, EM_SETLIMITTEXT, 240, 0);
    browse = button(Browse, 340, 104, 84, 40);
    SetWindowTextW(browse, t(L"Browse", L"Обзор"));
    scope = button(Scope, Margin, 156, 172, 36);
    primary = button(Primary, 300, 192, 124, 40);
    releases = button(Releases, 626, 66, 118, 32);
    SetWindowTextW(releases, t(L"All releases  ↗", L"Все релизы  ↗"));
    showPage(checkRelease ? Page::Connecting : Page::Folder);
}

void Setup::layoutControls() const {
    const auto move = [this](HWND control, int x, int y) {
        SetWindowPos(control, nullptr, px(x), px(y), 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
    };
    move(minimize, viewWidth - 76, 6);
    move(close, viewWidth - 40, 6);
    move(path, Margin + 12, expanded ? 144 : 116);
    move(browse, expanded ? 244 : 340, expanded ? 185 : 104);
    move(scope, Margin, expanded ? 187 : 156);
    if (page == Page::Folder) move(primary, expanded ? 204 : 300, expanded ? 386 : 192);
    else move(primary, ((expanded ? InstallPane : Width) - 124) / 2, expanded ? 258 : 154);
}

void Setup::requestLauncherSize(bool open) {
    const float target = open ? 1.0f : 0.0f;
    if (!canExpand || (expandStart ? target == targetExpansion : target == expansion)) return;
    if (!expandStart) {
        RECT bounds{};
        GetWindowRect(window, &bounds);
        resizeCenter = {(bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2};
    }
    fromExpansion = expansion;
    targetExpansion = target;
    expandStart = GetTickCount64();
    SetTimer(window, LayoutTimer, animate ? 16 : 40, nullptr);
}

void Setup::resizeLauncher() {
    const auto now = GetTickCount64();
    const float time = animate ? std::min(1.0f, static_cast<float>(now - expandStart) / ExpandTime) : 1.0f;
    const float eased = time * time * (3.0f - 2.0f * time);
    expansion = fromExpansion + (targetExpansion - fromExpansion) * eased;
    viewWidth = Width + static_cast<int>((LauncherWidth - Width) * expansion);
    viewHeight = Height + static_cast<int>((LauncherHeight - Height) * expansion);
    const LONG width = px(viewWidth), height = px(viewHeight);
    const int x = std::clamp(resizeCenter.x - width / 2, workArea.left, workArea.right - width);
    const int y = std::clamp(resizeCenter.y - height / 2, workArea.top, workArea.bottom - height);
    SetWindowPos(window, nullptr, x, y, width, height, SWP_NOZORDER | SWP_NOACTIVATE);
    if (!acrylic) {
        HRGN shape = CreateRoundRectRgn(0, 0, width + 1, height + 1, px(24), px(24));
        if (shape && !SetWindowRgn(window, shape, FALSE)) DeleteObject(shape);
    }
    if (time == 1.0f) {
        expandStart = 0;
        expanded = targetExpansion == 1.0f;
        initialExpanded = initialExpanded || expanded;
        showPage(page);
        SetTimer(window, LayoutTimer, 80, nullptr);
    } else {
        layoutControls();
        InvalidateRect(window, nullptr, FALSE);
    }
}

void Setup::pollLayout() {
    if (IsIconic(window)) return;
    if (expandStart) {
        resizeLauncher();
    } else if (!initialExpanded) {
        if (update.stage != UpdateStage::Connecting || GetTickCount64() - shownAt >= 650) requestLauncherSize(true);
    } else if (feed.state != FeedState::Loading) {
        KillTimer(window, LayoutTimer);
        InvalidateRect(window, nullptr, FALSE);
    }
}

void Setup::captureFrost() {
    if (!expanded) return;
    HDC target = GetDC(window);
    if (!target) return;
    const int width = px(viewWidth), height = px(viewHeight), header = px(HeaderHeight);
    PaintBuffer snapshot(target, width, height);
    ReleaseDC(window, target);
    if (!snapshot.previous) return;
    render(snapshot.dc);
    GdiFlush();
    Bitmap pixels(width, height, width * 4, PixelFormat32bppRGB, static_cast<BYTE *>(snapshot.bits));
    const int smallWidth = width / 3, smallHeight = (height - header) / 3;
    auto blurred = std::make_unique<Bitmap>(smallWidth, smallHeight, PixelFormat32bppARGB);
    {
        Graphics graphics(blurred.get());
        graphics.SetInterpolationMode(InterpolationModeHighQualityBicubic);
        graphics.DrawImage(&pixels, Rect(0, 0, smallWidth, smallHeight), 0, header, width, height - header, UnitPixel);
    }
    Blur blur;
    BlurParams parameters{static_cast<REAL>(px(8)), FALSE};
    if (blur.SetParameters(&parameters) == Ok && blurred->ApplyEffect(&blur, nullptr) == Ok) frost = std::move(blurred);
}

void Setup::render(HDC dc, bool glass) const {
    const RECT client = rect(0, 0, viewWidth, viewHeight);
    HBRUSH background = CreateSolidBrush(Canvas);
    FillRect(dc, &client, background);
    DeleteObject(background);
    RECT chip{};
    const bool showFrost = frost && (page == Page::Downloading || busy());
    const std::wstring message = status();
    if (busy() || updating()) {
        SIZE measured{};
        const HGDIOBJ previous = SelectObject(dc, font);
        GetTextExtentPoint32W(dc, message.c_str(), static_cast<int>(message.size()), &measured);
        SelectObject(dc, previous);
        const int chipWidth = measured.cx + px(50);
        const int centerX = Width / 2 + static_cast<int>((InstallPane - Width) * expansion / 2);
        const int top = 132 + static_cast<int>(100 * expansion);
        const int left = px(centerX) - chipWidth / 2;
        chip = {left, px(top), left + chipWidth, px(top + 36)};
    }
    {
        Graphics graphics(dc);
        graphics.SetSmoothingMode(SmoothingModeAntiAlias);
        graphics.SetInterpolationMode(InterpolationModeHighQualityBicubic);
        if (showFrost) {
            const float fade = page == Page::Completing ? 1.0f - reveal() : 1.0f;
            const float opacity = (0.30f + expansion * 0.33f) * fade;
            const ColorMatrix matrix{{{1, 0, 0, 0, 0}, {0, 1, 0, 0, 0}, {0, 0, 1, 0, 0},
                                      {0, 0, 0, opacity, 0}, {0, 0, 0, 0, 1}}};
            ImageAttributes alpha;
            alpha.SetColorMatrix(&matrix);
            graphics.DrawImage(frost.get(), Rect(0, px(HeaderHeight), px(viewWidth), px(viewHeight - HeaderHeight)),
                               0, 0, static_cast<int>(frost->GetWidth()), static_cast<int>(frost->GetHeight()), UnitPixel, &alpha);
        }
        SolidBrush fill(glass ? Color(0, 0, 0) : colorref(Header));
        graphics.FillRectangle(&fill, Rect(0, 0, px(viewWidth), px(HeaderHeight)));
        if (logo && logo->GetLastStatus() == Ok) graphics.DrawImage(logo, Rect(px(12), px(11), px(84), px(22)));
        drawCaptionButton(graphics, minimize, rect(viewWidth - 76, 6, 32, 32));
        drawCaptionButton(graphics, close, rect(viewWidth - 40, 6, 32, 32));
        if (page == Page::Folder && (!canExpand || expanded)) {
            roundFill(graphics, rect(Margin, expanded ? 132 : 104, 304, 40), px(10), Field, GetFocus() == path ? Blue : Border);
        } else if (busy() || updating()) {
            const auto fade = page == Page::Completing ? reveal() : 0.0f;
            roundFill(graphics, chip, px(12), blend(Field, Canvas, fade), blend(Border, Canvas, fade));
            Pen track(colorref(blend(Border, Canvas, fade)), static_cast<REAL>(px(2)));
            Pen arc(colorref(blend(RGB(106, 140, 249), Canvas, fade)), static_cast<REAL>(px(2)));
            arc.SetStartCap(LineCapRound);
            arc.SetEndCap(LineCapRound);
            const Rect spinner(chip.left + px(13), chip.top + px(11), px(14), px(14));
            graphics.DrawEllipse(&track, spinner);
            graphics.DrawArc(&arc, spinner, static_cast<REAL>(phase - 90), 105.0f);
        }
    }

    const int panelWidth = expanded ? InstallPane : Width;
    if (page == Page::Folder && (!canExpand || expanded)) {
        write(dc, rect(Margin, expanded ? 68 : 64, panelWidth - 2 * Margin, 28), title, Text,
              t(L"Installation folder", L"Папка установки"), DT_SINGLELINE | DT_VCENTER);
        if (!pathError.empty()) {
            write(dc, rect(Margin, expanded ? 344 : 198, 260, 40), font, RGB(255, 164, 157), pathError.c_str(), DT_WORDBREAK);
        } else if (updateUnavailable) {
            write(dc, rect(Margin, expanded ? 340 : 192, 262, 40), font, Muted,
                  t(L"Couldn’t check for updates", L"Не удалось проверить обновления"), DT_SINGLELINE | DT_VCENTER);
        }
    } else if (busy() || updating()) {
        const auto fade = page == Page::Completing ? reveal() : 0.0f;
        chip.left += px(36);
        write(dc, chip, font, blend(Text, Canvas, fade), message.c_str(), DT_SINGLELINE | DT_VCENTER);
    } else if (page == Page::Ready) {
        write(dc, rect(Margin, expanded ? 204 : 102, panelWidth - 2 * Margin, 32), title, Text,
              t(L"Ready", L"Готово"), DT_CENTER | DT_SINGLELINE | DT_VCENTER);
    } else if (page == Page::Failed) {
        write(dc, rect(Margin, expanded ? 183 : 86, panelWidth - 2 * Margin, 32), title, Text,
              t(L"Setup stopped", L"Установка прервалась"), DT_CENTER | DT_SINGLELINE | DT_VCENTER);
        write(dc, rect(Margin, expanded ? 222 : 122, panelWidth - 2 * Margin, 24), font, Muted,
              t(L"Check the installation folder", L"Проверьте папку установки"), DT_CENTER | DT_SINGLELINE);
    }
    if (expansion > 0.55f && page != Page::Downloading && !busy()) drawFeed(dc);
}

void Setup::drawFeed(HDC dc) const {
    constexpr int left = InstallPane + Margin;
    constexpr int width = LauncherWidth - left - Margin;
    const float fade = std::min(1.0f, (expansion - 0.55f) / 0.45f);
    const auto tint = [fade](COLORREF color) { return blend(Canvas, color, fade); };
    const auto state = feed.state.load();
    {
        Graphics graphics(dc);
        Pen divider(colorref(tint(RGB(39, 42, 53))));
        graphics.DrawLine(&divider, px(InstallPane), px(64), px(InstallPane), px(432));
        if (state == FeedState::Ready) {
            graphics.SetSmoothingMode(SmoothingModeAntiAlias);
            for (size_t i = 0; i < feed.notes.size(); ++i) {
                roundFill(graphics, rect(left, 114 + 106 * static_cast<int>(i), width, 94), px(14),
                          tint(RGB(21, 23, 29)), tint(RGB(41, 44, 54)));
            }
        }
    }
    write(dc, rect(left, 68, 216, 28), title, tint(Text), t(L"What’s new", L"Что нового"), DT_SINGLELINE | DT_VCENTER);
    if (state != FeedState::Ready) {
        write(dc, rect(left, 124, width, 32), font, tint(Muted),
              state == FeedState::Loading ? t(L"Loading releases…", L"Загружаем релизы…")
                                          : t(L"Releases are unavailable", L"Не удалось загрузить релизы"), DT_SINGLELINE);
        return;
    }
    int top = 114;
    for (const auto &release : feed.notes) {
        write(dc, rect(left + 14, top + 10, width - 142, 24), label, tint(Text), release.title.c_str(), DT_SINGLELINE | DT_VCENTER);
        write(dc, rect(left + width - 124, top + 10, 110, 24), font, tint(Muted), release.date.c_str(),
              DT_RIGHT | DT_SINGLELINE | DT_VCENTER);
        write(dc, rect(left + 14, top + 36, width - 28, 54), font, tint(Muted), release.summary.c_str(), DT_WORDBREAK | DT_END_ELLIPSIS);
        top += 106;
    }
}

void Setup::drawCaptionButton(Graphics &graphics, HWND button, RECT bounds) const {
    const LRESULT state = SendMessageW(button, BM_GETSTATE, 0, 0);
    const bool focused = (state & BST_FOCUS) && !(SendMessageW(button, WM_QUERYUISTATE, 0, 0) & UISF_HIDEFOCUS);
    const bool enabled = IsWindowEnabled(button) != FALSE;
    if (enabled && ((state & BST_PUSHED) || focused || hotCaption == button)) {
        roundFill(graphics, bounds, px(10), RGB(41, 45, 55), focused ? RGB(103, 131, 230) : RGB(41, 45, 55));
    }
    const REAL x = static_cast<REAL>(bounds.left + bounds.right) / 2;
    const REAL y = static_cast<REAL>(bounds.top + bounds.bottom) / 2;
    const REAL span = static_cast<REAL>(px(5));
    Pen stroke(colorref(enabled ? RGB(205, 209, 221) : RGB(71, 75, 84)), static_cast<REAL>(px(2)));
    stroke.SetStartCap(LineCapRound);
    stroke.SetEndCap(LineCapRound);
    if (button == close) {
        graphics.DrawLine(&stroke, x - span + 1, y - span + 1, x + span - 1, y + span - 1);
        graphics.DrawLine(&stroke, x - span + 1, y + span - 1, x + span - 1, y - span + 1);
    } else {
        graphics.DrawLine(&stroke, x - span, y, x + span, y);
    }
}

void Setup::paint(HDC dc) const {
    // The caption controls use the same Acrylic surface. Keep the other native
    // controls clipped out of the parent paint, including while focus changes.
    for (HWND control : {path, browse, scope, primary, releases}) {
        if (IsWindowVisible(control)) {
            const auto bounds = childBounds(control, window);
            ExcludeClipRect(dc, bounds.left, bounds.top, bounds.right, bounds.bottom);
        }
    }
    const int width = px(viewWidth), height = px(viewHeight);
    PaintBuffer buffer(dc, width, height);
    if (!buffer.previous) {
        render(dc);
        return;
    }
    render(buffer.dc, acrylic);
    if (acrylic || page == Page::Completing) {
        GdiFlush();
        auto *pixels = static_cast<std::uint32_t *>(buffer.bits);
        const float time = page == Page::Completing ? reveal() : 0;
        const float light = px(4) + px(104) * time;
        const float envelope = 4 * time * (1 - time);
        for (int y = 0; y < px(HeaderHeight); ++y) {
            for (int x = 0; x < width; ++x) {
                auto &pixel = pixels[y * width + x];
                auto red = (pixel >> 16) & 255, green = (pixel >> 8) & 255, blue = pixel & 255;
                const auto markAlpha = std::max({red, green, blue});
                if (time > 0 && x >= px(12) && x < px(96) && y >= px(11) && y < px(33) && markAlpha > 80) {
                    const float distance = std::abs(static_cast<float>(x) - light);
                    const float gain = 1 - 0.36f * envelope * std::min(1.0f, distance / px(21));
                    red = static_cast<std::uint32_t>(red * gain);
                    green = static_cast<std::uint32_t>(green * gain);
                    blue = static_cast<std::uint32_t>(blue * gain);
                }
                pixel = acrylic ? glassPixel(red, green, blue, markAlpha) : (red << 16) | (green << 8) | blue;
            }
        }
    }
    BitBlt(dc, 0, 0, width, height, buffer.dc, 0, 0, SRCCOPY);
}

void Setup::drawButton(const DRAWITEMSTRUCT &info) const {
    WCHAR text[64];
    const bool main = info.CtlID == Primary;
    const bool focused = (info.itemState & ODS_FOCUS) != 0;
    const bool pushed = (info.itemState & ODS_SELECTED) != 0;
    if (info.CtlID == Close || info.CtlID == Minimize) return;
    GetWindowTextW(info.hwndItem, text, ARRAYSIZE(text));
    {
        Graphics graphics(info.hDC);
        graphics.SetSmoothingMode(SmoothingModeAntiAlias);
        graphics.Clear(colorref(Canvas));
        const COLORREF color = main ? (pushed ? RGB(48, 79, 186) : Blue) : (pushed ? Border : Field);
        roundFill(graphics, info.rcItem, px(main ? 18 : 11), color,
                  focused && (info.itemState & ODS_NOFOCUSRECT) == 0 ? RGB(130, 155, 244) : (main ? color : Border));
    }
    write(info.hDC, info.rcItem, label, Text, text, DT_CENTER | DT_SINGLELINE | DT_VCENTER);
}

void Setup::showPage(Page next) {
    if (page != next) {
        if (next == Page::Downloading || next == Page::Installing) {
            captureFrost();
            requestLauncherSize(false);
        }
        if (next == Page::Folder && initialExpanded) requestLauncherSize(true);
        if (next == Page::Ready || next == Page::Failed || next == Page::Folder) frost.reset();
        pageStart = GetTickCount64();
    }
    page = next;
    const bool folder = page == Page::Folder && (!canExpand || expanded);
    ShowWindow(path, folder ? SW_SHOW : SW_HIDE);
    ShowWindow(browse, folder ? SW_SHOW : SW_HIDE);
    ShowWindow(scope, folder && !machinePath.empty() ? SW_SHOW : SW_HIDE);
    ShowWindow(minimize, SW_SHOW);
    ShowWindow(close, SW_SHOW);
    EnableWindow(close, !busy());
    layoutControls();
    SetWindowTextW(scope, allUsers ? t(L"All users  ▾", L"Для всех  ▾") : t(L"Only me  ▾", L"Только для меня  ▾"));
    SetWindowTextW(primary, page == Page::Ready ? t(L"Open", L"Открыть")
                : page == Page::Failed ? t(L"Try again", L"Повторить") : t(L"Install", L"Установить"));
    const bool showAction = folder || page == Page::Ready || page == Page::Failed;
    ShowWindow(primary, showAction ? SW_SHOW : SW_HIDE);
    ShowWindow(releases, expanded && !busy() && page != Page::Downloading ? SW_SHOW : SW_HIDE);
    InvalidateRect(window, nullptr, FALSE);
    if (showAction && testProfile.empty()) SetFocus(primary);
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

bool Setup::openUpdate() {
    std::wstring command = L"\"" + update.installer + L"\" /nova-fetched";
    if (!testProfile.empty()) command += L" \"" + testProfile + L"\"";
    STARTUPINFOW startup{sizeof(startup)};
    PROCESS_INFORMATION child{};
    // Hold the child until this window has released the installer mutex.
    if (!CreateProcessW(update.installer.c_str(), command.data(), nullptr, nullptr, FALSE, CREATE_SUSPENDED,
                        nullptr, nullptr, &startup, &child)) return false;
    CloseHandle(child.hProcess);
    handoffThread = child.hThread;
    result = 0;
    DestroyWindow(window);
    return true;
}

void Setup::poll() {
    if (updating()) {
        const auto stage = update.stage.load();
        if (stage == UpdateStage::Connecting || stage == UpdateStage::Downloading) {
            if (stage == UpdateStage::Downloading && page != Page::Downloading && (!canExpand || initialExpanded)) {
                showPage(Page::Downloading);
                update.allowDownload();
            } else if (stage == UpdateStage::Downloading && IsIconic(window)) {
                update.allowDownload();
            }
            if (animate) {
                phase = static_cast<int>(((GetTickCount64() - pageStart) / 3) % 360);
                InvalidateRect(window, nullptr, FALSE);
            }
        } else if (!canExpand || (initialExpanded && !expandStart)) {
            KillTimer(window, Timer);
            if (stage == UpdateStage::Ready && openUpdate()) return;
            updateUnavailable = stage != UpdateStage::Current;
            showPage(Page::Folder);
        }
        return;
    }
    if (page == Page::Completing) {
        if (reveal() < 1.0f) {
            InvalidateRect(window, nullptr, FALSE);
        } else {
            KillTimer(window, Timer);
            showPage(Page::Ready);
        }
        return;
    }
    if (!installProcess) return;
    if (WaitForSingleObject(installProcess, 0) == WAIT_TIMEOUT) {
        if (animate) {
            phase = static_cast<int>(((GetTickCount64() - pageStart) / 3) % 360);
            InvalidateRect(window, nullptr, FALSE);
        }
        return;
    }
    if (expandStart) return;
    DWORD code = 1;
    GetExitCodeProcess(installProcess, &code);
    CloseHandle(installProcess);
    installProcess = nullptr;
    const DWORD installed = GetFileAttributesW(launchPath.c_str());
    const bool complete = code == ManualInstallComplete && installed != INVALID_FILE_ATTRIBUTES && !(installed & FILE_ATTRIBUTE_DIRECTORY);
    if (complete && animate) {
        showPage(Page::Completing);
    } else {
        KillTimer(window, Timer);
        showPage(complete ? Page::Ready : Page::Failed);
    }
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
    } else if (id == Minimize) {
        ShowWindow(window, SW_MINIMIZE);
    } else if (id == Releases) {
        ShellExecuteW(window, L"open", L"https://github.com/DeLorean-bot/NOVA/releases", nullptr, nullptr, SW_SHOWNORMAL);
    } else if (id == Close) {
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
        case WM_TIMER:
            if (wParam == LayoutTimer) setup->pollLayout();
            else if (wParam == Timer) setup->poll();
            return 0;
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
            if (point.y >= 0 && point.y < setup->px(HeaderHeight) && point.x < setup->px(setup->viewWidth - 76) &&
                !setup->expandStart) return HTCAPTION;
            break;
        }
        case WM_CLOSE:
            if (!setup->busy()) {
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
                                     const wchar_t *logoPath, const wchar_t *version, wchar_t *launch, int launchCapacity) {
    if (launchCapacity <= 0) return -1;
    launch[0] = L'\0';
    Setup setup;
    setup.installer = installer;
    setup.product = product;
    setup.userPath = userPath;
    setup.machinePath = machinePath;
    setup.russian = PRIMARYLANGID(static_cast<LANGID>(language)) == LANG_RUSSIAN;
    setup.allUsers = allUsers && !setup.machinePath.empty();
    setup.checkRelease = setup.product == L"NOVA";
    int argumentCount{};
    if (auto argv = CommandLineToArgvW(GetCommandLineW(), &argumentCount)) {
        for (int i = 1; i < argumentCount; ++i) {
            const std::wstring argument(argv[i]);
            if (argument == L"/nova-fetched") setup.checkRelease = false;
            if (argument.compare(0, 15, L"--test-profile=") == 0) setup.testProfile = argument;
        }
        LocalFree(argv);
    }
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
    auto &area = setup.workArea;
    SystemParametersInfoW(SPI_GETWORKAREA, 0, &area, 0);
    setup.canExpand = area.right - area.left >= setup.px(LauncherWidth) && area.bottom - area.top >= setup.px(LauncherHeight);
    if (setup.canExpand && !setup.checkRelease) {
        setup.expanded = true;
        setup.initialExpanded = true;
        setup.expansion = setup.targetExpansion = 1.0f;
        setup.viewWidth = LauncherWidth;
        setup.viewHeight = LauncherHeight;
    }
    if (setup.product != L"NOVA") setup.feed.state = FeedState::Unavailable;
    const int width = setup.px(setup.viewWidth), height = setup.px(setup.viewHeight);
    HWND window = CreateWindowExW(WS_EX_APPWINDOW | WS_EX_CONTROLPARENT, ClassName, L"NOVA Setup",
                                  WS_POPUP | WS_SYSMENU | WS_MINIMIZEBOX | WS_THICKFRAME,
                                  area.left + (area.right - area.left - width) / 2,
                                  area.top + (area.bottom - area.top - height) / 2,
                                  width, height, nullptr, nullptr, module, &setup);
    if (window) {
        if (definition.hIcon) SendMessageW(window, WM_SETICON, ICON_BIG, reinterpret_cast<LPARAM>(definition.hIcon));
        if (definition.hIconSm) SendMessageW(window, WM_SETICON, ICON_SMALL, reinterpret_cast<LPARAM>(definition.hIconSm));
        const DWM_WINDOW_CORNER_PREFERENCE corner = DWMWCP_ROUND;
        DwmSetWindowAttribute(window, DWMWA_WINDOW_CORNER_PREFERENCE, &corner, sizeof(corner));
        const COLORREF frame = Border;
        DwmSetWindowAttribute(window, DWMWA_BORDER_COLOR, &frame, sizeof(frame));
        setup.acrylic = applyAcrylic(window, setup.px(HeaderHeight));
        if (!setup.acrylic) {
            HRGN shape = CreateRoundRectRgn(0, 0, width + 1, height + 1, setup.px(24), setup.px(24));
            if (shape && !SetWindowRgn(window, shape, FALSE)) DeleteObject(shape);
        }
        const bool testing = !setup.testProfile.empty();
        ShowWindow(window, testing ? SW_SHOWNOACTIVATE : SW_SHOW);
        if (!testing && !setup.checkRelease) SetFocus(setup.primary);
        UpdateWindow(window);
        setup.shownAt = GetTickCount64();
        if (setup.canExpand) {
            if (setup.product == L"NOVA") setup.feed.start(setup.russian);
            SetTimer(window, LayoutTimer, !setup.expanded && setup.animate ? 16 : 80, nullptr);
        }
        if (setup.checkRelease) {
            setup.update.start(version);
            SetTimer(window, Timer, setup.animate ? 24 : 100, nullptr);
        }
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
    DeleteObject(setup.pathFont);
    UnregisterClassW(ClassName, module);
    if (definition.hIcon) DestroyIcon(definition.hIcon);
    if (definition.hIconSm) DestroyIcon(definition.hIconSm);
    delete setup.logo;
    setup.frost.reset();
    GdiplusShutdown(gdi);
    if (SUCCEEDED(com)) CoUninitialize();
    CloseHandle(mutex);
    if (setup.handoffThread) {
        ResumeThread(setup.handoffThread);
        CloseHandle(setup.handoffThread);
    }
    return setup.result;
}

BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) module = instance;
    return TRUE;
}
