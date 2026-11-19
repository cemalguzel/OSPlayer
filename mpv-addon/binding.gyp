{
  "targets": [
    {
      "target_name": "mpv_addon",
      "sources": ["src/mpv_addon.cpp"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "include"
      ],
      "libraries": ["<(module_root_dir)/lib/libmpv-2.lib"],
      # C++ istisnaları AÇIK olmalı: addon hata yollarında `throw Napi::Error(...)`
      # kullanıyor. Kapalı olursa node-addon-api sarmalayıcısında try/catch yok →
      # throw V8 çerçevelerinden geçip std::terminate() ile tüm süreci çökertir.
      # AÇIK olunca throw, JS tarafında yakalanabilir hataya çevrilir (main.ts fallback'i çalışır).
      "defines": ["NAPI_CPP_EXCEPTIONS"],
      "cflags_cc!": ["-fno-exceptions"],
      "cflags_cc": ["-fexceptions"],
      "conditions": [
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/std:c++17"]
            }
          },
          "defines": ["WIN32", "_WINDOWS", "NAPI_CPP_EXCEPTIONS"]
        }]
      ]
    }
  ]
}
