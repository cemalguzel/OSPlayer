/**
 * mpv_addon.cpp  —  N-API (node-addon-api) wrapper for libmpv-2.dll
 *
 * Exposed JS API (all sync unless noted):
 *   create()                          → BigInt (handle)
 *   initialize(handle)                → void
 *   terminate(handle)                 → void
 *   destroy(handle)                   → void
 *   setOptionString(handle, key, val) → void
 *   setWid(handle, hwnd_bigint)       → void
 *   commandString(handle, cmd)        → void
 *   command(handle, args[])           → void
 *   getPropertyString(handle, name)   → string | null
 *   setPropertyString(handle, name, v)→ void
 *   setPropertyBool(handle, name, v)  → void
 *   setPropertyDouble(handle, name, v)→ void
 *   getPropertyDouble(handle, name)   → number | null
 *   observeProperty(handle, id, name) → void
 *   waitEvent(handle, ms)             → object | null  (async-friendly)
 *   clientApiVersion()                → number
 *   errorString(err)                  → string
 */

#define NAPI_VERSION 8
#include <napi.h>
#include <mpv/client.h>

#ifdef _WIN32
#include <windows.h>
#endif

#ifdef __APPLE__
#import <Cocoa/Cocoa.h>
#import <OpenGL/gl.h>
#import <dispatch/dispatch.h>
#include <mpv/render.h>
#include <mpv/render_gl.h>
#include <map>
#elif defined(__linux__)
// X11 ABI: ayrı sistem geliştirme başlığı gerektirmeyen dar pencere arayüzü.
extern "C" {
struct _XDisplay; typedef _XDisplay Display; typedef unsigned long Window;
Display* XOpenDisplay(const char*); int XCloseDisplay(Display*);
Window XCreateSimpleWindow(Display*, Window, int, int, unsigned int, unsigned int, unsigned int, unsigned long, unsigned long);
int XMapWindow(Display*, Window); int XDestroyWindow(Display*, Window);
int XMoveResizeWindow(Display*, Window, int, int, unsigned int, unsigned int); int XFlush(Display*);
}
static Display* videoDisplay = nullptr;
#endif
#include <dlfcn.h>
#include <cstdint>
#include <string>
#include <stdexcept>


struct MpvApi {
decltype(&::mpv_create) mpv_create;
decltype(&::mpv_initialize) mpv_initialize;
decltype(&::mpv_terminate_destroy) mpv_terminate_destroy;
decltype(&::mpv_destroy) mpv_destroy;
decltype(&::mpv_client_api_version) mpv_client_api_version;
decltype(&::mpv_error_string) mpv_error_string;
decltype(&::mpv_set_option_string) mpv_set_option_string;
decltype(&::mpv_set_option) mpv_set_option;
decltype(&::mpv_command_string) mpv_command_string;
decltype(&::mpv_command) mpv_command;
decltype(&::mpv_get_property_string) mpv_get_property_string;
decltype(&::mpv_free) mpv_free;
decltype(&::mpv_set_property_string) mpv_set_property_string;
decltype(&::mpv_set_property) mpv_set_property;
decltype(&::mpv_get_property) mpv_get_property;
decltype(&::mpv_observe_property) mpv_observe_property;
decltype(&::mpv_wait_event) mpv_wait_event;
decltype(&::mpv_event_name) mpv_event_name;
};
static MpvApi api;
static void* mpvLibrary = nullptr;
static void LoadMpv(Napi::Env env) {
void*& lib = mpvLibrary; if(lib) return;
#ifdef __APPLE__
const char* paths[]={"@executable_path/../Frameworks/libmpv.2.dylib", "/opt/homebrew/lib/libmpv.2.dylib", "/usr/local/lib/libmpv.2.dylib"};
#else
const char* paths[]={"libmpv.so.2", "libmpv.so.1"};
#endif
for(auto p:paths) {lib=dlopen(p, RTLD_NOW|RTLD_LOCAL); if(lib) break;}
if(!lib) throw Napi::Error::New(env,"MPV kütüphanesi bulunamadı. MPV kurulumu gerekli.");
api.mpv_create=reinterpret_cast<decltype(api.mpv_create)>(dlsym(lib,"mpv_create")); if(!api.mpv_create) { dlclose(lib); lib=nullptr; throw Napi::Error::New(env,"MPV API uyumsuz: mpv_create"); }
api.mpv_initialize=reinterpret_cast<decltype(api.mpv_initialize)>(dlsym(lib,"mpv_initialize")); if(!api.mpv_initialize) { dlclose(lib); lib=nullptr; throw Napi::Error::New(env,"MPV API uyumsuz: mpv_initialize"); }
api.mpv_terminate_destroy=reinterpret_cast<decltype(api.mpv_terminate_destroy)>(dlsym(lib,"mpv_terminate_destroy")); if(!api.mpv_terminate_destroy) { dlclose(lib); lib=nullptr; throw Napi::Error::New(env,"MPV API uyumsuz: mpv_terminate_destroy"); }
api.mpv_destroy=reinterpret_cast<decltype(api.mpv_destroy)>(dlsym(lib,"mpv_destroy")); if(!api.mpv_destroy) { dlclose(lib); lib=nullptr; throw Napi::Error::New(env,"MPV API uyumsuz: mpv_destroy"); }
api.mpv_client_api_version=reinterpret_cast<decltype(api.mpv_client_api_version)>(dlsym(lib,"mpv_client_api_version")); if(!api.mpv_client_api_version) { dlclose(lib); lib=nullptr; throw Napi::Error::New(env,"MPV API uyumsuz: mpv_client_api_version"); }
api.mpv_error_string=reinterpret_cast<decltype(api.mpv_error_string)>(dlsym(lib,"mpv_error_string")); if(!api.mpv_error_string) { dlclose(lib); lib=nullptr; throw Napi::Error::New(env,"MPV API uyumsuz: mpv_error_string"); }
api.mpv_set_option_string=reinterpret_cast<decltype(api.mpv_set_option_string)>(dlsym(lib,"mpv_set_option_string")); if(!api.mpv_set_option_string) { dlclose(lib); lib=nullptr; throw Napi::Error::New(env,"MPV API uyumsuz: mpv_set_option_string"); }
api.mpv_set_option=reinterpret_cast<decltype(api.mpv_set_option)>(dlsym(lib,"mpv_set_option")); if(!api.mpv_set_option) { dlclose(lib); lib=nullptr; throw Napi::Error::New(env,"MPV API uyumsuz: mpv_set_option"); }
api.mpv_command_string=reinterpret_cast<decltype(api.mpv_command_string)>(dlsym(lib,"mpv_command_string")); if(!api.mpv_command_string) { dlclose(lib); lib=nullptr; throw Napi::Error::New(env,"MPV API uyumsuz: mpv_command_string"); }
api.mpv_command=reinterpret_cast<decltype(api.mpv_command)>(dlsym(lib,"mpv_command")); if(!api.mpv_command) { dlclose(lib); lib=nullptr; throw Napi::Error::New(env,"MPV API uyumsuz: mpv_command"); }
api.mpv_get_property_string=reinterpret_cast<decltype(api.mpv_get_property_string)>(dlsym(lib,"mpv_get_property_string")); if(!api.mpv_get_property_string) { dlclose(lib); lib=nullptr; throw Napi::Error::New(env,"MPV API uyumsuz: mpv_get_property_string"); }
api.mpv_free=reinterpret_cast<decltype(api.mpv_free)>(dlsym(lib,"mpv_free")); if(!api.mpv_free) { dlclose(lib); lib=nullptr; throw Napi::Error::New(env,"MPV API uyumsuz: mpv_free"); }
api.mpv_set_property_string=reinterpret_cast<decltype(api.mpv_set_property_string)>(dlsym(lib,"mpv_set_property_string")); if(!api.mpv_set_property_string) { dlclose(lib); lib=nullptr; throw Napi::Error::New(env,"MPV API uyumsuz: mpv_set_property_string"); }
api.mpv_set_property=reinterpret_cast<decltype(api.mpv_set_property)>(dlsym(lib,"mpv_set_property")); if(!api.mpv_set_property) { dlclose(lib); lib=nullptr; throw Napi::Error::New(env,"MPV API uyumsuz: mpv_set_property"); }
api.mpv_get_property=reinterpret_cast<decltype(api.mpv_get_property)>(dlsym(lib,"mpv_get_property")); if(!api.mpv_get_property) { dlclose(lib); lib=nullptr; throw Napi::Error::New(env,"MPV API uyumsuz: mpv_get_property"); }
api.mpv_observe_property=reinterpret_cast<decltype(api.mpv_observe_property)>(dlsym(lib,"mpv_observe_property")); if(!api.mpv_observe_property) { dlclose(lib); lib=nullptr; throw Napi::Error::New(env,"MPV API uyumsuz: mpv_observe_property"); }
api.mpv_wait_event=reinterpret_cast<decltype(api.mpv_wait_event)>(dlsym(lib,"mpv_wait_event")); if(!api.mpv_wait_event) { dlclose(lib); lib=nullptr; throw Napi::Error::New(env,"MPV API uyumsuz: mpv_wait_event"); }
api.mpv_event_name=reinterpret_cast<decltype(api.mpv_event_name)>(dlsym(lib,"mpv_event_name")); if(!api.mpv_event_name) { dlclose(lib); lib=nullptr; throw Napi::Error::New(env,"MPV API uyumsuz: mpv_event_name"); }
}
#define mpv_create api.mpv_create
#define mpv_initialize api.mpv_initialize
#define mpv_terminate_destroy api.mpv_terminate_destroy
#define mpv_destroy api.mpv_destroy
#define mpv_client_api_version api.mpv_client_api_version
#define mpv_error_string api.mpv_error_string
#define mpv_set_option_string api.mpv_set_option_string
#define mpv_set_option api.mpv_set_option
#define mpv_command_string api.mpv_command_string
#define mpv_command api.mpv_command
#define mpv_get_property_string api.mpv_get_property_string
#define mpv_free api.mpv_free
#define mpv_set_property_string api.mpv_set_property_string
#define mpv_set_property api.mpv_set_property
#define mpv_get_property api.mpv_get_property
#define mpv_observe_property api.mpv_observe_property
#define mpv_wait_event api.mpv_wait_event
#define mpv_event_name api.mpv_event_name

#ifdef __APPLE__
static decltype(&::mpv_render_context_create) renderCreate;
static decltype(&::mpv_render_context_render) renderFrame;
static decltype(&::mpv_render_context_free) renderFree;
static void* GetGL(void*, const char* name) {
    static void* gl=dlopen("/System/Library/Frameworks/OpenGL.framework/OpenGL",RTLD_NOW);
    return dlsym(gl,name);
}
// Çizim kuyruğu MPV komutlarını çalıştıran Electron ana iş parçacığından ayrıdır.
// Senkron loadfile/property çağrıları çizim beklerken görüntü üretimi devam eder.
@interface OSPlayerVideoView : NSOpenGLView {
@public mpv_render_context* renderer;
    dispatch_queue_t renderQueue;
    dispatch_source_t frameTimer;
    int pixelWidth;
    int pixelHeight;
}
- (void)startFrames;
- (void)stopFrames;
@end
@implementation OSPlayerVideoView
- (void)startFrames {
    frameTimer=dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER,0,0,renderQueue);
    dispatch_source_set_timer(frameTimer,dispatch_time(DISPATCH_TIME_NOW,0),NSEC_PER_SEC/60,NSEC_PER_MSEC);
    dispatch_source_set_event_handler(frameTimer,^{
        @autoreleasepool {
        if(!renderer || pixelWidth<1 || pixelHeight<1) return;
        [[self openGLContext] makeCurrentContext];
        mpv_opengl_fbo fbo={0,pixelWidth,pixelHeight,0};
        int flip=1;
        mpv_render_param params[]={{MPV_RENDER_PARAM_OPENGL_FBO,&fbo},{MPV_RENDER_PARAM_FLIP_Y,&flip},{MPV_RENDER_PARAM_INVALID,nullptr}};
        renderFrame(renderer,params);
        [[self openGLContext] flushBuffer];
        [NSOpenGLContext clearCurrentContext];
        }
    });
    dispatch_resume(frameTimer);
}
- (void)drawRect:(NSRect)dirty {
    // Cocoa ölçüleri yalnız ana iş parçacığında okunur. Retina fiziksel pikseli korunur.
    NSRect pixels=[self convertRectToBacking:[self bounds]];
    int width=(int)pixels.size.width, height=(int)pixels.size.height;
    dispatch_async(renderQueue,^{
        [[self openGLContext] makeCurrentContext];
        [[self openGLContext] update];
        pixelWidth=width; pixelHeight=height;
        [NSOpenGLContext clearCurrentContext];
    });
}
- (void)stopFrames {
    if(frameTimer) {
        dispatch_source_cancel(frameTimer);
        dispatch_release(frameTimer);
        frameTimer=nullptr;
    }
    // Kuyruktaki son kare bitmeden renderer veya NSView serbest bırakılmaz.
    if(renderQueue) dispatch_sync(renderQueue,^{
        if(renderer) {
            [[self openGLContext] makeCurrentContext];
            renderFree(renderer); renderer=nullptr;
            [NSOpenGLContext clearCurrentContext];
        }
    });
}
- (void)dealloc {
    [self stopFrames];
    if(renderQueue) dispatch_release(renderQueue);
    [super dealloc];
}
@end
static OSPlayerVideoView* activeView=nullptr;
static std::map<mpv_handle*,OSPlayerVideoView*> renderedViews;
static void AttachRenderer(mpv_handle* h,Napi::Env env) {
    // Core ve renderer kesinlikle aynı dylib örneğinden gelmeli.
    if(!mpvLibrary || !activeView) throw Napi::Error::New(env,"macOS video çizim alanı hazır değil.");
    renderCreate=(decltype(renderCreate))dlsym(mpvLibrary,"mpv_render_context_create");
    renderFrame=(decltype(renderFrame))dlsym(mpvLibrary,"mpv_render_context_render");
    renderFree=(decltype(renderFree))dlsym(mpvLibrary,"mpv_render_context_free");
    if(!renderCreate||!renderFrame||!renderFree) throw Napi::Error::New(env,"MPV çizim API bulunamadı.");
    OSPlayerVideoView* view=activeView;
    __block int error=0;
    dispatch_sync(view->renderQueue,^{
        [[view openGLContext] makeCurrentContext];
        mpv_opengl_init_params gl={GetGL,nullptr};
        mpv_render_param params[]={{MPV_RENDER_PARAM_API_TYPE,(void*)MPV_RENDER_API_TYPE_OPENGL},{MPV_RENDER_PARAM_OPENGL_INIT_PARAMS,&gl},{MPV_RENDER_PARAM_INVALID,nullptr}};
        error=renderCreate(&view->renderer,h,params);
        [NSOpenGLContext clearCurrentContext];
    });
    if(error<0) throw Napi::Error::New(env,std::string("MPV OpenGL başlatılamadı: ")+mpv_error_string(error));
    renderedViews[h]=view; [view startFrames]; [view setNeedsDisplay:YES];
}
#endif
// ── Helpers ────────────────────────────────────────────────────────────────

static mpv_handle* GetHandle(const Napi::CallbackInfo& info, int idx = 0) {
    if (info[idx].IsBigInt()) {
        bool lossless = false;
        uint64_t raw = info[idx].As<Napi::BigInt>().Uint64Value(&lossless);
        return reinterpret_cast<mpv_handle*>(raw);
    }
    throw Napi::TypeError::New(info.Env(), "handle must be BigInt");
}

static void CheckError(Napi::Env env, int err, const char* ctx = "") {
    if (err < 0) {
        std::string msg = std::string(ctx) + ": " + mpv_error_string(err);
        throw Napi::Error::New(env, msg);
    }
}

// ── Core ────────────────────────────────────────────────────────────────────

// create() → BigInt
static Napi::Value Create(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    LoadMpv(env);
    mpv_handle* h = mpv_create();
    if (!h) throw Napi::Error::New(env, "mpv_create() failed");
    uint64_t raw = reinterpret_cast<uint64_t>(h);
    return Napi::BigInt::New(env, raw);
}

// initialize(handle)
static void Initialize(const Napi::CallbackInfo& info) {
    mpv_handle* h = GetHandle(info, 0);
    CheckError(info.Env(), mpv_initialize(h), "mpv_initialize");
#ifdef __APPLE__
    AttachRenderer(h,info.Env());
#endif
}

// terminate(handle)
static void Terminate(const Napi::CallbackInfo& info) {
    mpv_handle* h = GetHandle(info, 0);
    #ifdef __APPLE__
    auto view=renderedViews.find(h);
    if(view!=renderedViews.end()) { [view->second stopFrames]; renderedViews.erase(view); }
#endif
    mpv_terminate_destroy(h);
}

// destroy(handle)
static void Destroy(const Napi::CallbackInfo& info) {
    mpv_handle* h = GetHandle(info, 0);
    mpv_destroy(h);
}

// clientApiVersion() → number
static Napi::Value ClientApiVersion(const Napi::CallbackInfo& info) {
    unsigned long v = mpv_client_api_version();
    return Napi::Number::New(info.Env(), static_cast<double>(v));
}

// errorString(code) → string
static Napi::Value ErrorString(const Napi::CallbackInfo& info) {
    int code = info[0].As<Napi::Number>().Int32Value();
    return Napi::String::New(info.Env(), mpv_error_string(code));
}

// ── Options ─────────────────────────────────────────────────────────────────

// setOptionString(handle, key, value)
static void SetOptionString(const Napi::CallbackInfo& info) {
    mpv_handle* h = GetHandle(info, 0);
    std::string key = info[1].As<Napi::String>().Utf8Value();
    std::string val = info[2].As<Napi::String>().Utf8Value();
    CheckError(info.Env(), mpv_set_option_string(h, key.c_str(), val.c_str()), "mpv_set_option_string");
}

// setWid(handle, hwnd_as_bigint)  — Windows HWND embed
static void SetWid(const Napi::CallbackInfo& info) {
    mpv_handle* h = GetHandle(info, 0);
#ifdef __APPLE__
    return; // Cocoa görüntüsü render API üzerinden aynı süreçte çizilir.
#endif
    bool lossless = false;
    uint64_t hwnd_val = info[1].As<Napi::BigInt>().Uint64Value(&lossless);
    int64_t wid = static_cast<int64_t>(hwnd_val);
    CheckError(info.Env(),
        mpv_set_option(h, "wid", MPV_FORMAT_INT64, &wid),
        "mpv_set_option wid");

}

// ── Commands ─────────────────────────────────────────────────────────────────

// commandString(handle, cmd_string)
static void CommandString(const Napi::CallbackInfo& info) {
    mpv_handle* h = GetHandle(info, 0);
    std::string cmd = info[1].As<Napi::String>().Utf8Value();
    CheckError(info.Env(), mpv_command_string(h, cmd.c_str()), "mpv_command_string");
}

// command(handle, [arg0, arg1, ...])
static void Command(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    mpv_handle* h = GetHandle(info, 0);
    Napi::Array arr = info[1].As<Napi::Array>();
    uint32_t len = arr.Length();

    std::vector<std::string> strs(len);
    std::vector<const char*> argv(len + 1);
    for (uint32_t i = 0; i < len; i++) {
        // ToString() ile her türü (sayı/boolean dahil) güvenle string'e çevir;
        // .As<String>() sayıya uygulanınca napi_fatal_error ile süreci çökertir.
        strs[i] = arr.Get(i).ToString().Utf8Value();
        argv[i] = strs[i].c_str();
    }
    argv[len] = nullptr;
    CheckError(env, mpv_command(h, argv.data()), "mpv_command");
}

// ── Properties ───────────────────────────────────────────────────────────────

// getPropertyString(handle, name) → string | null
static Napi::Value GetPropertyString(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    mpv_handle* h = GetHandle(info, 0);
    std::string name = info[1].As<Napi::String>().Utf8Value();
    char* val = mpv_get_property_string(h, name.c_str());
    if (!val) return env.Null();
    Napi::Value ret = Napi::String::New(env, val);
    mpv_free(val);
    return ret;
}

// setPropertyString(handle, name, value)
static void SetPropertyString(const Napi::CallbackInfo& info) {
    mpv_handle* h = GetHandle(info, 0);
    std::string name = info[1].As<Napi::String>().Utf8Value();
    std::string val  = info[2].As<Napi::String>().Utf8Value();
    // Don't throw on set property errors — property might not exist yet
    mpv_set_property_string(h, name.c_str(), val.c_str());
}

// setPropertyBool(handle, name, bool)
static void SetPropertyBool(const Napi::CallbackInfo& info) {
    mpv_handle* h = GetHandle(info, 0);
    std::string name = info[1].As<Napi::String>().Utf8Value();
    int val = info[2].As<Napi::Boolean>().Value() ? 1 : 0;
    mpv_set_property(h, name.c_str(), MPV_FORMAT_FLAG, &val);
}

// setPropertyDouble(handle, name, number)
static void SetPropertyDouble(const Napi::CallbackInfo& info) {
    mpv_handle* h = GetHandle(info, 0);
    std::string name = info[1].As<Napi::String>().Utf8Value();
    double val = info[2].As<Napi::Number>().DoubleValue();
    mpv_set_property(h, name.c_str(), MPV_FORMAT_DOUBLE, &val);
}

// getPropertyDouble(handle, name) → number | null
static Napi::Value GetPropertyDouble(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    mpv_handle* h = GetHandle(info, 0);
    std::string name = info[1].As<Napi::String>().Utf8Value();
    double val = 0;
    int err = mpv_get_property(h, name.c_str(), MPV_FORMAT_DOUBLE, &val);
    if (err < 0) return env.Null();
    return Napi::Number::New(env, val);
}

// getPropertyBool(handle, name) → boolean | null
static Napi::Value GetPropertyBool(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    mpv_handle* h = GetHandle(info, 0);
    std::string name = info[1].As<Napi::String>().Utf8Value();
    int val = 0;
    int err = mpv_get_property(h, name.c_str(), MPV_FORMAT_FLAG, &val);
    if (err < 0) return env.Null();
    return Napi::Boolean::New(env, val != 0);
}

// observeProperty(handle, reply_id, name)
static void ObserveProperty(const Napi::CallbackInfo& info) {
    mpv_handle* h = GetHandle(info, 0);
    uint64_t id   = info[1].As<Napi::Number>().Uint32Value();
    std::string name = info[2].As<Napi::String>().Utf8Value();
    mpv_observe_property(h, id, name.c_str(), MPV_FORMAT_NONE);
}

// ── Event polling ─────────────────────────────────────────────────────────────
// waitEvent(handle, timeout_ms) → object | null
// Returns a plain JS object describing the event, or null on timeout.
// Designed to be called from a JS async loop (setImmediate / setTimeout).

static Napi::Value WaitEvent(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    mpv_handle* h = GetHandle(info, 0);
    double timeout_ms = info[1].IsNumber() ? info[1].As<Napi::Number>().DoubleValue() : 0.0;

    mpv_event* ev = mpv_wait_event(h, timeout_ms / 1000.0);
    if (!ev || ev->event_id == MPV_EVENT_NONE) return env.Null();

    Napi::Object obj = Napi::Object::New(env);
    obj.Set("id",   Napi::Number::New(env, static_cast<int>(ev->event_id)));
    obj.Set("name", Napi::String::New(env, mpv_event_name(ev->event_id)));
    obj.Set("error", Napi::Number::New(env, ev->error));

    if (ev->event_id == MPV_EVENT_PROPERTY_CHANGE) {
        mpv_event_property* prop = static_cast<mpv_event_property*>(ev->data);
        Napi::Object pobj = Napi::Object::New(env);
        pobj.Set("name", Napi::String::New(env, prop->name));
        pobj.Set("replyId", Napi::Number::New(env, static_cast<double>(ev->reply_userdata)));

        // Try to get the actual value via string for simplicity
        char* sval = mpv_get_property_string(h, prop->name);
        if (sval) {
            pobj.Set("value", Napi::String::New(env, sval));
            mpv_free(sval);
        } else {
            pobj.Set("value", env.Null());
        }
        obj.Set("property", pobj);
    }

    if (ev->event_id == MPV_EVENT_END_FILE) {
        mpv_event_end_file* ef = static_cast<mpv_event_end_file*>(ev->data);
        Napi::Object eobj = Napi::Object::New(env);
        eobj.Set("reason", Napi::Number::New(env, ef->reason));
        eobj.Set("error",  Napi::Number::New(env, ef->error));
        obj.Set("endFile", eobj);
    }

    return obj;
}

// ── Windows HWND Yönetimi (Çakışma Önleyici) ─────────────────────────────────

#ifdef _WIN32
// Video alt penceresi için siyah arka planlı özel sınıf — STATIC'in varsayılan
// BEYAZ arka planı yerine, MPV ilk kareyi çizene kadar (ve ayrıldıktan sonra)
// siyah görünür. Beyaz parlamayı önler.
static const char* kVideoWndClass = "OSPlayerVideoWnd";
static bool g_videoClassRegistered = false;

static void EnsureVideoClass() {
    if (g_videoClassRegistered) return;
    WNDCLASSEXA wc;
    ZeroMemory(&wc, sizeof(wc));
    wc.cbSize        = sizeof(wc);
    wc.lpfnWndProc   = DefWindowProcA;
    wc.hInstance     = GetModuleHandle(NULL);
    wc.hCursor       = LoadCursor(NULL, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)GetStockObject(BLACK_BRUSH);
    wc.lpszClassName = kVideoWndClass;
    RegisterClassExA(&wc);
    g_videoClassRegistered = true;
}
#endif

static Napi::Value CreateVideoWindow(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) return env.Null();

#ifdef _WIN32
    bool lossless;
    int64_t parent_hwnd_val = info[0].As<Napi::BigInt>().Int64Value(&lossless);
    HWND parent = (HWND)parent_hwnd_val;

    EnsureVideoClass();
    HWND child_hwnd = CreateWindowExA(
        0, kVideoWndClass, "",
        WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN | WS_CLIPSIBLINGS,
        0, 0, 1280, 720, parent, NULL, GetModuleHandle(NULL), NULL
    );
    return Napi::BigInt::New(env, (int64_t)child_hwnd);
#elif defined(__APPLE__)
    bool lossless;
    NSView* parent = reinterpret_cast<NSView*>(info[0].As<Napi::BigInt>().Uint64Value(&lossless));
    if (!parent) return env.Null();
    NSOpenGLPixelFormatAttribute attrs[]={NSOpenGLPFAOpenGLProfile,NSOpenGLProfileVersion3_2Core,NSOpenGLPFADoubleBuffer,NSOpenGLPFAAccelerated,0};
    NSOpenGLPixelFormat* format=[[NSOpenGLPixelFormat alloc] initWithAttributes:attrs];
    OSPlayerVideoView* child=[[OSPlayerVideoView alloc] initWithFrame:NSMakeRect(0,0,1280,720) pixelFormat:format];
    [format release];
    if(!child || ![child openGLContext]) {
        [child release];
        throw Napi::Error::New(env,"macOS OpenGL 3.2 görüntü alanı oluşturulamadı.");
    }
    child->renderer=nullptr; child->frameTimer=nullptr;
    child->renderQueue=dispatch_queue_create("com.ortaksistem.osplayer.mpv-render",DISPATCH_QUEUE_SERIAL);
    child->pixelWidth=1280; child->pixelHeight=720;
    [child setWantsBestResolutionOpenGLSurface:YES]; activeView=child;
    [parent addSubview:child];
    return Napi::BigInt::New(env, reinterpret_cast<uint64_t>(child));
#elif defined(__linux__)
    if (!videoDisplay) videoDisplay = XOpenDisplay(nullptr);
    if (!videoDisplay) throw Napi::Error::New(env,"X11 görüntü sunucusuna bağlanılamadı. XWayland gerekli.");
    bool lossless;
    Window parent=info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    Window child=XCreateSimpleWindow(videoDisplay,parent,0,0,1280,720,0,0,0);
    XMapWindow(videoDisplay,child); XFlush(videoDisplay);
    return Napi::BigInt::New(env,static_cast<uint64_t>(child));
#else
    return env.Null();
#endif
}

// destroyVideoWindow(hwnd) — orphan child pencereyi yok et (beyaz kalıntı önlenir)
static Napi::Value DestroyVideoWindow(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) return env.Undefined();

#ifdef _WIN32
    bool lossless;
    int64_t hwnd_val = info[0].As<Napi::BigInt>().Int64Value(&lossless);
    HWND hwnd = (HWND)hwnd_val;
    if (hwnd && IsWindow(hwnd)) DestroyWindow(hwnd);
#elif defined(__APPLE__)
    bool lossless; NSView* child=reinterpret_cast<NSView*>(info[0].As<Napi::BigInt>().Uint64Value(&lossless));
    [(OSPlayerVideoView*)child stopFrames];
    if(activeView==child) activeView=nullptr;
    [child removeFromSuperview]; [child release];
#elif defined(__linux__)
    bool lossless; Window child=info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    if(videoDisplay && child) { XDestroyWindow(videoDisplay,child); XFlush(videoDisplay); }
#endif
    return env.Undefined();
}

static Napi::Value ResizeVideoWindow(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 5) return env.Undefined();

#ifdef _WIN32
    bool lossless;
    int64_t hwnd_val = info[0].As<Napi::BigInt>().Int64Value(&lossless);
    HWND hwnd = (HWND)hwnd_val;

    int x = info[1].As<Napi::Number>().Int32Value();
    int y = info[2].As<Napi::Number>().Int32Value();
    int w = info[3].As<Napi::Number>().Int32Value();
    int h = info[4].As<Napi::Number>().Int32Value();

    SetWindowPos(hwnd, NULL, x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE);
#else
    bool lossless; uint64_t raw=info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    int x=info[1].As<Napi::Number>().Int32Value(), y=info[2].As<Napi::Number>().Int32Value();
    int w=std::max(1,info[3].As<Napi::Number>().Int32Value()), h=std::max(1,info[4].As<Napi::Number>().Int32Value());
#ifdef __APPLE__
    NSView* child=reinterpret_cast<NSView*>(raw); NSView* parent=[child superview];
    CGFloat top=[parent isFlipped]?y:([parent bounds].size.height-y-h);
    [child setFrame:NSMakeRect(x,top,w,h)];
#elif defined(__linux__)
    if(videoDisplay) { XMoveResizeWindow(videoDisplay,static_cast<Window>(raw),x,y,w,h); XFlush(videoDisplay); }
#endif
#endif
    return env.Undefined();
}

// ── Module Init ──────────────────────────────────────────────────────────────

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("create",             Napi::Function::New(env, Create));
    exports.Set("initialize",         Napi::Function::New(env, Initialize));
    exports.Set("terminate",          Napi::Function::New(env, Terminate));
    exports.Set("destroy",            Napi::Function::New(env, Destroy));
    exports.Set("clientApiVersion",   Napi::Function::New(env, ClientApiVersion));
    exports.Set("errorString",        Napi::Function::New(env, ErrorString));
    exports.Set("setOptionString",    Napi::Function::New(env, SetOptionString));
    exports.Set("setWid",             Napi::Function::New(env, SetWid));
    exports.Set("commandString",      Napi::Function::New(env, CommandString));
    exports.Set("command",            Napi::Function::New(env, Command));
    exports.Set("getPropertyString",  Napi::Function::New(env, GetPropertyString));
    exports.Set("setPropertyString",  Napi::Function::New(env, SetPropertyString));
    exports.Set("setPropertyBool",    Napi::Function::New(env, SetPropertyBool));
    exports.Set("setPropertyDouble",  Napi::Function::New(env, SetPropertyDouble));
    exports.Set("getPropertyDouble",  Napi::Function::New(env, GetPropertyDouble));
    exports.Set("getPropertyBool",    Napi::Function::New(env, GetPropertyBool));
    exports.Set("observeProperty",    Napi::Function::New(env, ObserveProperty));
    exports.Set("waitEvent",          Napi::Function::New(env, WaitEvent));

    exports.Set("createVideoWindow",  Napi::Function::New(env, CreateVideoWindow));
    exports.Set("resizeVideoWindow",  Napi::Function::New(env, ResizeVideoWindow));
    exports.Set("destroyVideoWindow", Napi::Function::New(env, DestroyVideoWindow));
    return exports;
}

NODE_API_MODULE(mpv_addon, Init)
