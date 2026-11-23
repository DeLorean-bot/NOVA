#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <commctrl.h>
#include <uxtheme.h>

#ifndef _M_IX86
#error The NSIS wizard loads 32-bit DLLs.
#endif
#pragma comment(linker, "/export:NovaApplyTheme=_NovaApplyTheme@4")

static const COLORREF canvas = RGB(20, 20, 23);
static const COLORREF raised = RGB(34, 34, 40);
static const COLORREF edge = RGB(67, 67, 77);
static const COLORREF foreground = RGB(242, 242, 244);
static const COLORREF muted = RGB(144, 144, 157);
static const COLORREF blue = RGB(49, 89, 209);
static const COLORREF focus = RGB(141, 172, 255);
static HBRUSH canvasBrush, raisedBrush;
static HWND wizard;
static HHOOK dialogHook;

static void roundRect(HDC dc, const RECT *rect, COLORREF fill, COLORREF border, int diameter) {
    HBRUSH brush = fill == CLR_NONE ? (HBRUSH)GetStockObject(NULL_BRUSH) : CreateSolidBrush(fill);
    HPEN pen = CreatePen(PS_SOLID, 1, border);
    HGDIOBJ oldBrush = SelectObject(dc, brush);
    HGDIOBJ oldPen = SelectObject(dc, pen);
    RoundRect(dc, rect->left, rect->top, rect->right, rect->bottom, diameter, diameter);
    SelectObject(dc, oldPen);
    SelectObject(dc, oldBrush);
    DeleteObject(pen);
    if (fill != CLR_NONE) DeleteObject(brush);
}

static void paintButton(HWND button, HDC dc, BOOL hover) {
    RECT rect, label;
    WCHAR text[256];
    LONG_PTR style = GetWindowLongPtrW(button, GWL_STYLE) & BS_TYPEMASK;
    UINT state = (UINT)SendMessageW(button, BM_GETSTATE, 0, 0);
    BOOL enabled = IsWindowEnabled(button);
    BOOL pushed = (state & BST_PUSHED) != 0;
    BOOL primary = GetDlgCtrlID(button) == IDOK;
    BOOL radio = style == BS_RADIOBUTTON || style == BS_AUTORADIOBUTTON;
    BOOL check = style == BS_CHECKBOX || style == BS_AUTOCHECKBOX || radio;
    BOOL group = style == BS_GROUPBOX;
    BOOL selected = (state & BST_CHECKED) != 0;
    BOOL focused = GetFocus() == button;
    UINT flags = DT_SINGLELINE | DT_VCENTER;
    int unit = GetDeviceCaps(dc, LOGPIXELSX);
    int gap = MulDiv(10, unit, 96);
    int mark = MulDiv(14, unit, 96);
    HFONT font = (HFONT)SendMessageW(button, WM_GETFONT, 0, 0);
    HGDIOBJ oldFont = font ? SelectObject(dc, font) : NULL;

    GetClientRect(button, &rect);
    if (!group) FillRect(dc, &rect, canvasBrush);
    GetWindowTextW(button, text, ARRAYSIZE(text));
    SetBkMode(dc, TRANSPARENT);
    SetTextColor(dc, enabled ? foreground : muted);
    if (SendMessageW(button, WM_QUERYUISTATE, 0, 0) & UISF_HIDEACCEL) flags |= DT_HIDEPREFIX;

    label = rect;
    if (group) {
        RECT border = rect;
        SIZE size;
        GetTextExtentPoint32W(dc, text, lstrlenW(text), &size);
        border.top += size.cy / 2;
        roundRect(dc, &border, CLR_NONE, edge, gap);
        label.left += gap;
        label.right = label.left + size.cx + gap;
        label.bottom = label.top + size.cy;
        FillRect(dc, &label, canvasBrush);
        DrawTextW(dc, text, -1, &label, flags | DT_LEFT);
    } else if (check) {
        RECT icon = {1, (rect.bottom - mark) / 2, mark + 1, (rect.bottom + mark) / 2};
        COLORREF fill = selected && enabled ? blue : raised;
        roundRect(dc, &icon, fill, focused ? focus : (selected && enabled ? blue : edge), radio ? mark : gap / 2);
        if (selected) {
            RECT dot = icon;
            InflateRect(&dot, -mark / 3, -mark / 3);
            if (radio) {
                roundRect(dc, &dot, foreground, foreground, mark);
            } else {
                HPEN pen = CreatePen(PS_SOLID, 2, foreground);
                HGDIOBJ oldPen = SelectObject(dc, pen);
                MoveToEx(dc, icon.left + mark / 4, icon.top + mark / 2, NULL);
                LineTo(dc, icon.left + mark / 2, icon.top + mark * 3 / 4);
                LineTo(dc, icon.left + mark * 3 / 4, icon.top + mark / 4);
                SelectObject(dc, oldPen);
                DeleteObject(pen);
            }
        }
        label.left = icon.right + gap / 2;
        DrawTextW(dc, text, -1, &label, flags | DT_LEFT);
    } else {
        COLORREF fill = raised;
        if (primary && enabled) fill = pushed ? RGB(41, 74, 172) : (hover ? RGB(61, 104, 226) : blue);
        else if (hover && enabled) fill = RGB(44, 44, 52);
        roundRect(dc, &rect, fill, focused ? focus : (primary && enabled ? fill : edge), gap * 2);
        DrawTextW(dc, text, -1, &label, flags | DT_CENTER);
    }
    if (oldFont) SelectObject(dc, oldFont);
}

static LRESULT CALLBACK buttonProc(HWND control, UINT message, WPARAM wParam, LPARAM lParam,
                                   UINT_PTR id, DWORD_PTR hover) {
    if (message == WM_PAINT) {
        PAINTSTRUCT paint;
        HDC dc = BeginPaint(control, &paint);
        paintButton(control, dc, hover != 0);
        EndPaint(control, &paint);
        return 0;
    }
    if (message == WM_PRINTCLIENT) {
        paintButton(control, (HDC)wParam, hover != 0);
        return 0;
    }
    if (message == WM_ERASEBKGND) return 1;
    if (message == WM_NCDESTROY) RemoveWindowSubclass(control, buttonProc, id);
    if (message == WM_MOUSEMOVE && !hover) {
        TRACKMOUSEEVENT track = {sizeof(track), TME_LEAVE, control, 0};
        TrackMouseEvent(&track);
        SetWindowSubclass(control, buttonProc, id, 1);
        InvalidateRect(control, NULL, FALSE);
    } else if (message == WM_MOUSELEAVE) {
        SetWindowSubclass(control, buttonProc, id, 0);
        InvalidateRect(control, NULL, FALSE);
    }
    return DefSubclassProc(control, message, wParam, lParam);
}

static LRESULT CALLBACK dialogProc(HWND dialog, UINT message, WPARAM wParam, LPARAM lParam,
                                   UINT_PTR id, DWORD_PTR data) {
    (void)data;
    switch (message) {
        case WM_CTLCOLORDLG:
            return (LRESULT)canvasBrush;
        case WM_CTLCOLOREDIT:
            SetTextColor((HDC)wParam, foreground);
            SetBkColor((HDC)wParam, raised);
            return (LRESULT)raisedBrush;
        case WM_CTLCOLORSTATIC:
        case WM_CTLCOLORBTN:
            SetTextColor((HDC)wParam, IsWindowEnabled((HWND)lParam) ? foreground : muted);
            SetBkColor((HDC)wParam, canvas);
            return (LRESULT)canvasBrush;
        case WM_NCDESTROY:
            RemoveWindowSubclass(dialog, dialogProc, id);
            if (dialog == wizard) {
                UnhookWindowsHookEx(dialogHook);
                wizard = NULL;
                DeleteObject(canvasBrush);
                DeleteObject(raisedBrush);
            }
            break;
    }
    return DefSubclassProc(dialog, message, wParam, lParam);
}

static LRESULT CALLBACK separatorProc(HWND control, UINT message, WPARAM wParam, LPARAM lParam,
                                      UINT_PTR id, DWORD_PTR data) {
    (void)data;
    if (message == WM_PAINT || message == WM_PRINTCLIENT) {
        PAINTSTRUCT paint;
        HDC dc = message == WM_PAINT ? BeginPaint(control, &paint) : (HDC)wParam;
        RECT rect;
        GetClientRect(control, &rect);
        FillRect(dc, &rect, canvasBrush);
        rect.bottom = rect.top + 1;
        SetDCBrushColor(dc, edge);
        FillRect(dc, &rect, (HBRUSH)GetStockObject(DC_BRUSH));
        if (message == WM_PAINT) EndPaint(control, &paint);
        return 0;
    }
    if (message == WM_NCDESTROY) RemoveWindowSubclass(control, separatorProc, id);
    return DefSubclassProc(control, message, wParam, lParam);
}

static BOOL CALLBACK styleControl(HWND control, LPARAM reserved) {
    WCHAR name[32];
    DWORD_PTR data;
    (void)reserved;
    GetClassNameW(control, name, ARRAYSIZE(name));
    if (lstrcmpW(name, L"#32770") == 0) {
        SetWindowSubclass(control, dialogProc, 1, 0);
    } else if (lstrcmpW(name, WC_BUTTONW) == 0 && !GetWindowSubclass(control, buttonProc, 1, &data)) {
        SetWindowSubclass(control, buttonProc, 1, 0);
    } else if (lstrcmpW(name, WC_EDITW) == 0) {
        SetWindowTheme(control, L"", L"");
    } else if (lstrcmpW(name, WC_STATICW) == 0 && (GetWindowLongPtrW(control, GWL_STYLE) & SS_TYPEMASK) == SS_ETCHEDHORZ) {
        SetWindowSubclass(control, separatorProc, 1, 0);
    }
    return TRUE;
}

static LRESULT CALLBACK pageHook(int code, WPARAM wParam, LPARAM lParam) {
    if (code >= 0 && wizard) {
        const CWPRETSTRUCT *result = (const CWPRETSTRUCT *)lParam;
        if ((result->message == WM_INITDIALOG || result->message == WM_SHOWWINDOW) && IsChild(wizard, result->hwnd)) {
            WCHAR name[16];
            GetClassNameW(result->hwnd, name, ARRAYSIZE(name));
            if (lstrcmpW(name, L"#32770") == 0) {
                styleControl(result->hwnd, 0);
                EnumChildWindows(result->hwnd, styleControl, 0);
                InvalidateRect(result->hwnd, NULL, TRUE);
            }
        }
    }
    return CallNextHookEx(NULL, code, wParam, lParam);
}

void WINAPI NovaApplyTheme(HWND window) {
    if (wizard) return;
    canvasBrush = CreateSolidBrush(canvas);
    raisedBrush = CreateSolidBrush(raised);
    wizard = window;
    SetWindowSubclass(wizard, dialogProc, 1, 0);
    EnumChildWindows(wizard, styleControl, 0);
    dialogHook = SetWindowsHookExW(WH_CALLWNDPROCRET, pageHook, NULL, GetCurrentThreadId());
    InvalidateRect(wizard, NULL, TRUE);
}
