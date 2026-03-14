# Encoding

Tova provides functions for encoding and decoding data in common formats.

## Base64

### base64_encode

```tova
base64Encode(s) -> String
```

Encodes a string to Base64. Handles Unicode correctly.

```tova
base64Encode("hello")           // "aGVsbG8="
base64Encode("Hello, World!")   // "SGVsbG8sIFdvcmxkIQ=="
```

### base64_decode

```tova
base64Decode(s) -> String
```

Decodes a Base64 string back to the original string.

```tova
base64Decode("aGVsbG8=")       // "hello"
base64Decode("SGVsbG8sIFdvcmxkIQ==")  // "Hello, World!"
```

```tova
// Round-trip
original = "Tova is great!"
encoded = base64Encode(original)
decoded = base64Decode(encoded)
assertEq(decoded, original)
```

---

## URL Encoding

### url_encode

```tova
urlEncode(s) -> String
```

Encodes a string for safe use in URLs. Special characters are percent-encoded.

```tova
urlEncode("hello world")       // "hello%20world"
urlEncode("a=1&b=2")           // "a%3D1%26b%3D2"
urlEncode("cafe")               // "cafe"
```

### url_decode

```tova
urlDecode(s) -> String
```

Decodes a URL-encoded string.

```tova
urlDecode("hello%20world")     // "hello world"
urlDecode("a%3D1%26b%3D2")     // "a=1&b=2"
```

```tova
// Build a query string
params = [["q", "tova lang"], ["page", "1"]]
query = params
  |> map(fn(pair) "{urlEncode(pair[0])}={urlEncode(pair[1])}")
  |> join("&")
// "q=tova%20lang&page=1"
```

---

## Hex Encoding

### hex_encode

```tova
hexEncode(s) -> String
```

Encodes a string to hexadecimal (each character to its 2-digit hex code).

```tova
hexEncode("hello")          // "68656c6c6f"
hexEncode("AB")             // "4142"
```

### hex_decode

```tova
hexDecode(s) -> String
```

Decodes a hexadecimal string back to the original string.

```tova
hexDecode("68656c6c6f")    // "hello"
hexDecode("4142")           // "AB"
```

```tova
// Round-trip
original = "Tova"
encoded = hexEncode(original)
decoded = hexDecode(encoded)
assertEq(decoded, original)
```
