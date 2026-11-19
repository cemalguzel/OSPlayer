#include <napi.h>
#include <fstream>
#include <sstream>
#include <vector>
#include <string>

// Simple RC4 implementation for obfuscation/encryption
void rc4_crypt(std::vector<uint8_t>& data, const std::string& key) {
    std::vector<uint8_t> s(256);
    for (int i = 0; i < 256; i++) {
        s[i] = i;
    }
    
    int j = 0;
    for (int i = 0; i < 256; i++) {
        j = (j + s[i] + key[i % key.length()]) % 256;
        std::swap(s[i], s[j]);
    }
    
    int i = 0;
    j = 0;
    for (size_t k = 0; k < data.size(); k++) {
        i = (i + 1) % 256;
        j = (j + s[i]) % 256;
        std::swap(s[i], s[j]);
        data[k] ^= s[(s[i] + s[j]) % 256];
    }
}

// loadEncryptedFile(filePath, req, mod, filename, dirname)
Napi::Value LoadEncryptedFile(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 5) {
        Napi::TypeError::New(env, "Wrong number of arguments").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string filePath = info[0].As<Napi::String>().Utf8Value();
    Napi::Function req = info[1].As<Napi::Function>();
    Napi::Object mod = info[2].As<Napi::Object>();
    Napi::String filename = info[3].As<Napi::String>();
    Napi::String dirname = info[4].As<Napi::String>();

    // Hardcoded encryption key
    std::string key = "OSPlayer_Secure_Key_2026_X!";

    // Read the file
    std::ifstream file(filePath, std::ios::binary);
    if (!file) {
        Napi::Error::New(env, "Failed to open encrypted file").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::vector<uint8_t> data((std::istreambuf_iterator<char>(file)),
                               std::istreambuf_iterator<char>());
    file.close();

    // Decrypt
    rc4_crypt(data, key);
    
    std::string decrypted_str(data.begin(), data.end());

    // Wrap in CommonJS
    std::string wrapper = "(function(exports, require, module, __filename, __dirname) {\n" + decrypted_str + "\n})";

    // Run script
    napi_value result;
    napi_status status = napi_run_script(env, Napi::String::New(env, wrapper), &result);

    if (status != napi_ok) {
        Napi::Error::New(env, "Failed to evaluate decrypted script").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Function fn = Napi::Value(env, result).As<Napi::Function>();

    // Call the function
    Napi::Object exports = mod.Get("exports").As<Napi::Object>();
    fn.Call({ exports, req, mod, filename, dirname });

    return env.Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "loadEncryptedFile"), Napi::Function::New(env, LoadEncryptedFile));
    return exports;
}

NODE_API_MODULE(crypto_loader, Init)
