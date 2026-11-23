#pragma once

#include <windows.h>
#include <atomic>
#include <condition_variable>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

enum class UpdateStage { Connecting, Downloading, Current, Unavailable, Ready };

struct SetupUpdate {
    std::atomic<UpdateStage> stage{UpdateStage::Connecting};
    std::atomic<int> downloadPercent{0};
    std::wstring installer;

    void start(const std::wstring &version);
    void allowDownload();
    ~SetupUpdate();

private:
    void check(const std::wstring &version);

    std::atomic_bool cancelled{false};
    std::mutex downloadMutex;
    std::condition_variable downloadSignal;
    bool downloadAllowed{};
    std::thread worker;
    HANDLE verifiedFile{INVALID_HANDLE_VALUE};
};

struct ReleaseNote {
    std::wstring title, date, summary;
};

enum class FeedState { Loading, Ready, Unavailable };

struct ReleaseFeed {
    std::atomic<FeedState> state{FeedState::Loading};
    std::vector<ReleaseNote> notes;

    void start(bool russian);
    ~ReleaseFeed();

private:
    void load(bool russian);

    std::atomic_bool cancelled{false};
    std::thread worker;
};
