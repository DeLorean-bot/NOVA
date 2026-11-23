#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include "installer-update.h"
#include <bcrypt.h>
#include <shlobj.h>
#include <wincrypt.h>
#include <winhttp.h>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <array>
#include <charconv>
#include <string_view>

namespace {
constexpr wchar_t ReleaseRoot[] = L"/DeLorean-bot/NOVA/releases/";
constexpr std::uint64_t MaxPackageSize = 1024ull * 1024 * 1024;
using Version = std::array<unsigned int, 3>;
using Digest = std::array<BYTE, 64>;

struct HttpHandle {
    HINTERNET value;
    ~HttpHandle() { if (value) WinHttpCloseHandle(value); }
};

HINTERNET openSession() {
    const auto session = WinHttpOpen(L"NOVA Setup", WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
                                    WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!session) return nullptr;
    DWORD redirects = WINHTTP_OPTION_REDIRECT_POLICY_DISALLOW_HTTPS_TO_HTTP;
    if (WinHttpSetTimeouts(session, 2500, 3000, 3000, 3500) &&
        WinHttpSetOption(session, WINHTTP_OPTION_REDIRECT_POLICY, &redirects, sizeof(redirects))) return session;
    WinHttpCloseHandle(session);
    return nullptr;
}

struct FileHandle {
    HANDLE value;
    ~FileHandle() { if (value != INVALID_HANDLE_VALUE) CloseHandle(value); }
};

struct Sha512 {
    BCRYPT_ALG_HANDLE provider{};
    BCRYPT_HASH_HANDLE hash{};

    bool open() {
        return BCryptOpenAlgorithmProvider(&provider, BCRYPT_SHA512_ALGORITHM, nullptr, 0) >= 0 &&
               BCryptCreateHash(provider, &hash, nullptr, 0, nullptr, 0, 0) >= 0;
    }
    bool add(BYTE *data, DWORD size) const { return BCryptHashData(hash, data, size, 0) >= 0; }
    bool matches(const Digest &expected) const {
        Digest actual{};
        return BCryptFinishHash(hash, actual.data(), static_cast<ULONG>(actual.size()), 0) >= 0 && actual == expected;
    }
    ~Sha512() {
        if (hash) BCryptDestroyHash(hash);
        if (provider) BCryptCloseAlgorithmProvider(provider, 0);
    }
};

bool parseVersion(std::string_view text, Version &version) {
    if (text.empty() || text.size() > 24) return false;
    const char *cursor = text.data();
    const char *end = cursor + text.size();
    for (unsigned int &part : version) {
        const auto result = std::from_chars(cursor, end, part);
        if (result.ec != std::errc{}) return false;
        if (&part == &version.back()) return result.ptr == end;
        if (result.ptr == end || *result.ptr != '.') return false;
        cursor = result.ptr + 1;
    }
    return false;
}

std::string_view manifestField(std::string_view file, std::string_view prefix) {
    // electron-builder writes these fixed fields as single-line scalars.
    while (!file.empty()) {
        const auto end = file.find('\n');
        auto line = file.substr(0, end);
        if (!line.empty() && line.back() == '\r') line.remove_suffix(1);
        if (line.substr(0, prefix.size()) == prefix) return line.substr(prefix.size());
        if (end == std::string_view::npos) break;
        file.remove_prefix(end + 1);
    }
    return {};
}

template <typename Write>
bool fetch(HINTERNET server, const std::wstring &path, ULONGLONG deadline, const std::atomic_bool &cancelled, Write write,
           const wchar_t *headers = WINHTTP_NO_ADDITIONAL_HEADERS) {
    if (cancelled) return false;
    const HttpHandle request{WinHttpOpenRequest(server, L"GET", path.c_str(), nullptr, WINHTTP_NO_REFERER,
                                               WINHTTP_DEFAULT_ACCEPT_TYPES, WINHTTP_FLAG_SECURE | WINHTTP_FLAG_REFRESH)};
    if (!request.value || !WinHttpSendRequest(request.value, headers, headers ? static_cast<DWORD>(-1) : 0,
                                              WINHTTP_NO_REQUEST_DATA, 0, 0, 0) || cancelled ||
        !WinHttpReceiveResponse(request.value, nullptr)) return false;

    DWORD status{}, size = sizeof(status);
    if (!WinHttpQueryHeaders(request.value, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                             WINHTTP_HEADER_NAME_BY_INDEX, &status, &size, WINHTTP_NO_HEADER_INDEX) || status != 200) return false;

    std::array<BYTE, 64 * 1024> data;
    while (!cancelled && GetTickCount64() < deadline) {
        DWORD count{};
        if (!WinHttpReadData(request.value, data.data(), static_cast<DWORD>(data.size()), &count)) return false;
        if (!count) return !cancelled;
        if (!write(data.data(), count)) return false;
    }
    return false;
}

HANDLE openVerified(const std::wstring &path, const Digest &expected, std::uint64_t size, const std::atomic_bool &cancelled) {
    FileHandle file{CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING,
                                FILE_FLAG_SEQUENTIAL_SCAN | FILE_FLAG_OPEN_REPARSE_POINT, nullptr)};
    if (file.value == INVALID_HANDLE_VALUE) return INVALID_HANDLE_VALUE;
    BY_HANDLE_FILE_INFORMATION info{};
    LARGE_INTEGER length{};
    if (!GetFileInformationByHandle(file.value, &info) || (info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) ||
        !GetFileSizeEx(file.value, &length) || static_cast<std::uint64_t>(length.QuadPart) != size) return INVALID_HANDLE_VALUE;
    Sha512 sha;
    if (!sha.open()) return INVALID_HANDLE_VALUE;
    std::array<BYTE, 64 * 1024> data;
    while (!cancelled) {
        DWORD count{};
        if (!ReadFile(file.value, data.data(), static_cast<DWORD>(data.size()), &count, nullptr)) break;
        if (!count && sha.matches(expected)) {
            const HANDLE verified = file.value;
            file.value = INVALID_HANDLE_VALUE;
            return verified;
        }
        if (!count || !sha.add(data.data(), count)) break;
    }
    return INVALID_HANDLE_VALUE;
}

std::wstring cacheDirectory() {
    PWSTR local{};
    if (FAILED(SHGetKnownFolderPath(FOLDERID_LocalAppData, 0, nullptr, &local))) return {};
    const std::wstring directory = std::wstring(local) + L"\\NOVA Setup";
    CoTaskMemFree(local);
    CreateDirectoryW(directory.c_str(), nullptr);
    const DWORD attributes = GetFileAttributesW(directory.c_str());
    if (attributes == INVALID_FILE_ATTRIBUTES || !(attributes & FILE_ATTRIBUTE_DIRECTORY) ||
        (attributes & FILE_ATTRIBUTE_REPARSE_POINT)) return {};
    return directory;
}

std::wstring releaseSummary(std::wstring_view body, bool russian) {
    auto localized = body.find(russian ? L"\n## Русский" : L"\n## English");
    if (localized != std::wstring_view::npos) {
        body.remove_prefix(localized + 1);
        const auto end = body.find(L"\n## ");
        body = body.substr(0, end);
    }
    std::wstring summary;
    while (!body.empty()) {
        const auto end = body.find(L'\n');
        auto line = body.substr(0, end);
        if (line.substr(0, 2) == L"- " || line.substr(0, 2) == L"* ") line.remove_prefix(2);
        if (line.find_first_not_of(L" \r\t") != std::wstring_view::npos &&
            line.find_first_of(L"#|![<") != 0) {
            for (const wchar_t c : line) if (c != L'\r' && c != L'`' && c != L'*') summary += c;
            if (!summary.empty()) {
                constexpr size_t limit = 136;
                const auto sentence = summary.find(L". ", 24);
                if (sentence < limit) return summary.substr(0, sentence + 1);
                if (summary.size() <= limit) return summary;
                const auto space = summary.rfind(L' ', limit);
                return summary.substr(0, space > 48 && space != std::wstring::npos ? space : limit) + L"…";
            }
        }
        if (end == std::wstring_view::npos) break;
        body.remove_prefix(end + 1);
    }
    return {};
}

std::wstring releaseDate(std::wstring_view stamp, bool russian) {
    if (stamp.size() < 10) return {};
    SYSTEMTIME time{};
    unsigned short year{}, month{}, day{};
    if (swscanf_s(std::wstring(stamp.substr(0, 10)).c_str(), L"%hu-%hu-%hu", &year, &month, &day) != 3) return {};
    time.wYear = year;
    time.wMonth = month;
    time.wDay = day;
    wchar_t formatted[64];
    return GetDateFormatEx(russian ? L"ru-RU" : L"en-US", 0, &time, L"d MMM yyyy", formatted,
                           ARRAYSIZE(formatted), nullptr) ? formatted : L"";
}
} // namespace

void SetupUpdate::start(const std::wstring &version) {
    try {
        worker = std::thread([this, version] {
            try { check(version); } catch (...) {}
            if (stage == UpdateStage::Connecting || stage == UpdateStage::Downloading) stage = UpdateStage::Unavailable;
        });
    } catch (...) {
        stage = UpdateStage::Unavailable;
    }
}

SetupUpdate::~SetupUpdate() {
    {
        const std::lock_guard lock(downloadMutex);
        cancelled = true;
    }
    downloadSignal.notify_one();
    if (worker.joinable()) worker.join();
    if (verifiedFile != INVALID_HANDLE_VALUE) CloseHandle(verifiedFile);
}

void SetupUpdate::allowDownload() {
    {
        const std::lock_guard lock(downloadMutex);
        downloadAllowed = true;
    }
    downloadSignal.notify_one();
}

void SetupUpdate::check(const std::wstring &currentVersion) {
    Version current{}, latest{};
    std::string asciiVersion;
    for (wchar_t character : currentVersion) {
        if (character != L'.' && (character < L'0' || character > L'9')) return;
        asciiVersion += static_cast<char>(character);
    }
    if (!parseVersion(asciiVersion, current)) return;

    const HttpHandle session{openSession()};
    if (!session.value) return;
    const HttpHandle server{WinHttpConnect(session.value, L"github.com", INTERNET_DEFAULT_HTTPS_PORT, 0)};
    if (!server.value) return;

    std::string metadata;
    if (!fetch(server.value, std::wstring(ReleaseRoot) + L"latest/download/latest.yml", GetTickCount64() + 7000, cancelled,
               [&metadata](const BYTE *data, DWORD count) {
                   if (metadata.size() + count > 16 * 1024) return false;
                   metadata.append(reinterpret_cast<const char *>(data), count);
                   return true;
               })) return;
    const auto version = manifestField(metadata, "version: ");
    if (!parseVersion(version, latest)) return;
    if (latest <= current) {
        stage = UpdateStage::Current;
        return;
    }

    const std::string filename = "NOVA-Setup-" + std::string(version) + ".exe";
    if (manifestField(metadata, "path: ") != filename) return;
    const auto checksum = manifestField(metadata, "sha512: ");
    Digest expected{};
    DWORD bytes = static_cast<DWORD>(expected.size());
    if (checksum.size() != 88 || !CryptStringToBinaryA(checksum.data(), static_cast<DWORD>(checksum.size()),
                                                        CRYPT_STRING_BASE64 | CRYPT_STRING_STRICT, expected.data(), &bytes,
                                                        nullptr, nullptr) || bytes != expected.size()) return;
    const auto sizeText = manifestField(metadata, "    size: ");
    std::uint64_t size{};
    if (sizeText.empty()) return;
    const auto sizeResult = std::from_chars(sizeText.data(), sizeText.data() + sizeText.size(), size);
    if (sizeResult.ec != std::errc{} || sizeResult.ptr != sizeText.data() + sizeText.size() || !size || size > MaxPackageSize) return;

    const auto directory = cacheDirectory();
    if (directory.empty() || cancelled) return;
    installer = directory + L"\\NOVA-Setup.exe";
    verifiedFile = openVerified(installer, expected, size, cancelled);
    if (verifiedFile != INVALID_HANDLE_VALUE) {
        stage = UpdateStage::Ready;
        return;
    }
    if (cancelled) return;

    stage = UpdateStage::Downloading;
    {
        std::unique_lock lock(downloadMutex);
        downloadSignal.wait(lock, [this] { return downloadAllowed || cancelled; });
        if (cancelled) return;
    }
    const auto remote = std::wstring(ReleaseRoot) + L"download/v" + std::wstring(version.begin(), version.end()) +
                        L"/" + std::wstring(filename.begin(), filename.end());
    wchar_t partial[MAX_PATH];
    if (!GetTempFileNameW(directory.c_str(), L"NVA", 0, partial)) return;
    struct PartialFile {
        const wchar_t *path;
        ~PartialFile() { DeleteFileW(path); }
    } cleanup{partial};
    {
        const FileHandle file{CreateFileW(partial, GENERIC_WRITE, 0, nullptr, OPEN_EXISTING,
                                           FILE_FLAG_SEQUENTIAL_SCAN | FILE_FLAG_OPEN_REPARSE_POINT, nullptr)};
        if (file.value == INVALID_HANDLE_VALUE) return;
        std::uint64_t received{};
        if (!fetch(server.value, remote, GetTickCount64() + 5 * 60 * 1000, cancelled,
                   [&](const BYTE *data, DWORD count) {
                       received += count;
                       DWORD written{};
                       if (received > size || !WriteFile(file.value, data, count, &written, nullptr) || written != count) return false;
                       downloadPercent = static_cast<int>(received * 100 / size);
                       return true;
                   }) || received != size || !FlushFileBuffers(file.value)) return;
    }
    {
        const FileHandle verified{openVerified(partial, expected, size, cancelled)};
        if (verified.value == INVALID_HANDLE_VALUE) return;
    }
    if (cancelled || !MoveFileExW(partial, installer.c_str(), MOVEFILE_REPLACE_EXISTING)) return;
    verifiedFile = openVerified(installer, expected, size, cancelled);
    if (verifiedFile != INVALID_HANDLE_VALUE) stage = UpdateStage::Ready;
}

void ReleaseFeed::start(bool russian) {
    try {
        worker = std::thread([this, russian] {
            try { load(russian); } catch (...) {}
            state = notes.empty() ? FeedState::Unavailable : FeedState::Ready;
        });
    } catch (...) {
        state = FeedState::Unavailable;
    }
}

ReleaseFeed::~ReleaseFeed() {
    cancelled = true;
    if (worker.joinable()) worker.join();
}

void ReleaseFeed::load(bool russian) {
    const HttpHandle session{openSession()};
    if (!session.value) return;
    const HttpHandle server{WinHttpConnect(session.value, L"api.github.com", INTERNET_DEFAULT_HTTPS_PORT, 0)};
    if (!server.value) return;
    std::string data;
    if (!fetch(server.value, L"/repos/DeLorean-bot/NOVA/releases?per_page=6", GetTickCount64() + 7000, cancelled,
               [&data](const BYTE *part, DWORD count) {
                   if (data.size() + count > 256 * 1024) return false;
                   data.append(reinterpret_cast<const char *>(part), count);
                   return true;
               }, L"Accept: application/vnd.github+json\r\nX-GitHub-Api-Version: 2022-11-28\r\n")) return;

    winrt::init_apartment(winrt::apartment_type::multi_threaded);
    struct Apartment { ~Apartment() { winrt::uninit_apartment(); } } apartment;
    const auto releases = winrt::Windows::Data::Json::JsonArray::Parse(winrt::to_hstring(data));
    for (const auto &item : releases) {
        const auto release = item.GetObject();
        if (release.GetNamedBoolean(L"draft", true) || release.GetNamedBoolean(L"prerelease", true)) continue;
        const auto tag = winrt::to_string(release.GetNamedString(L"tag_name", L""));
        Version version{};
        if (tag.size() < 2 || tag[0] != 'v' || !parseVersion(std::string_view(tag).substr(1), version)) continue;
        const auto stamp = release.GetNamedString(L"published_at", L"");
        const auto body = release.GetNamedString(L"body", L"");
        notes.push_back({L"NOVA " + std::wstring(tag.begin() + 1, tag.end()), releaseDate(stamp, russian), releaseSummary(body, russian)});
        if (notes.size() == 3) break;
    }
}
