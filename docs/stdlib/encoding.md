# Encoding

Tova provides functions for encoding and decoding data in common formats.

## Base64

### base64_encode

```tova
base64_encode(s) -> String
```

Encodes a string to Base64. Handles Unicode correctly.

```tova
base64_encode("hello")           // "aGVsbG8="
base64_encode("Hello, World!")   // "SGVsbG8sIFdvcmxkIQ=="
```

### base64_decode

```tova
base64_decode(s) -> String
```

Decodes a Base64 string back to the original string.

```tova
base64_decode("aGVsbG8=")       // "hello"
base64_decode("SGVsbG8sIFdvcmxkIQ==")  // "Hello, World!"
```

```tova
// Round-trip
original = "Tova is great!"
encoded = base64_encode(original)
decoded = base64_decode(encoded)
assert_eq(decoded, original)
```

---

## URL Encoding

### url_encode

```tova
url_encode(s) -> String
```

Encodes a string for safe use in URLs. Special characters are percent-encoded.

```tova
url_encode("hello world")       // "hello%20world"
url_encode("a=1&b=2")           // "a%3D1%26b%3D2"
url_encode("cafe")               // "cafe"
```

### url_decode

```tova
url_decode(s) -> String
```

Decodes a URL-encoded string.

```tova
url_decode("hello%20world")     // "hello world"
url_decode("a%3D1%26b%3D2")     // "a=1&b=2"
```

```tova
// Build a query string
params = [["q", "tova lang"], ["page", "1"]]
query = params
  |> map(fn(pair) "{url_encode(pair[0])}={url_encode(pair[1])}")
  |> join("&")
// "q=tova%20lang&page=1"
```

---

## Hex Encoding

### hex_encode

```tova
hex_encode(s) -> String
```

Encodes a string to hexadecimal (each character to its 2-digit hex code).

```tova
hex_encode("hello")          // "68656c6c6f"
hex_encode("AB")             // "4142"
```

### hex_decode

```tova
hex_decode(s) -> String
```

Decodes a hexadecimal string back to the original string.

```tova
hex_decode("68656c6c6f")    // "hello"
hex_decode("4142")           // "AB"
```

```tova
// Round-trip
original = "Tova"
encoded = hex_encode(original)
decoded = hex_decode(encoded)
assert_eq(decoded, original)
```
