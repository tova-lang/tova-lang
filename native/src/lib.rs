// Tova Native FFI Library
// Provides high-performance sort, hash, and data processing operations
// Called from Bun via FFI (bun:ffi)

use std::slice;

// ============================================================
// Numeric Sort — Radix sort for f64 (IEEE 754 trick)
// ============================================================

/// Sort an array of f64 values in-place using radix sort.
/// Radix sort on floats: reinterpret as u64, flip sign bit for correct ordering.
/// Time: O(n), Space: O(n). Beats comparison sort for n > ~256.
#[no_mangle]
pub unsafe extern "C" fn tova_sort_f64(ptr: *mut f64, len: usize) {
    if len <= 1 {
        return;
    }
    let data = slice::from_raw_parts_mut(ptr, len);

    // For small arrays, use insertion sort (cache-friendly, low overhead)
    if len <= 64 {
        insertion_sort_f64(data);
        return;
    }

    radix_sort_f64(data);
}

fn insertion_sort_f64(data: &mut [f64]) {
    for i in 1..data.len() {
        let key = data[i];
        let mut j = i;
        while j > 0 && data[j - 1] > key {
            data[j] = data[j - 1];
            j -= 1;
        }
        data[j] = key;
    }
}

/// IEEE 754 radix sort trick:
/// - Positive floats: bit pattern is already in correct order
/// - Negative floats: bit pattern is in reverse order, and all bits are flipped
/// Transform: if sign bit is set, flip all bits; else flip only sign bit
/// This gives a monotonically increasing u64 mapping for all f64 values.
fn radix_sort_f64(data: &mut [f64]) {
    let len = data.len();
    let mut keys: Vec<u64> = Vec::with_capacity(len);
    let mut buf: Vec<u64> = vec![0u64; len];

    // Convert f64 to sortable u64
    for &val in data.iter() {
        let bits = val.to_bits();
        let key = if bits >> 63 == 1 {
            !bits // negative: flip all bits
        } else {
            bits ^ (1u64 << 63) // positive: flip sign bit
        };
        keys.push(key);
    }

    // 4-pass radix sort on 16-bit chunks (64 bits / 4 passes = 16 bits per pass)
    for pass in 0..4u32 {
        let shift = pass * 16;
        let mut counts = [0u32; 65536];

        // Count
        for &key in keys.iter() {
            let digit = ((key >> shift) & 0xFFFF) as usize;
            counts[digit] += 1;
        }

        // Prefix sum
        let mut total = 0u32;
        for count in counts.iter_mut() {
            let c = *count;
            *count = total;
            total += c;
        }

        // Scatter
        for &key in keys.iter() {
            let digit = ((key >> shift) & 0xFFFF) as usize;
            let pos = counts[digit] as usize;
            buf[pos] = key;
            counts[digit] += 1;
        }

        // Swap
        std::mem::swap(&mut keys, &mut buf);
    }

    // Convert sortable u64 back to f64
    for (i, &key) in keys.iter().enumerate() {
        let bits = if key >> 63 == 0 {
            !key // was negative
        } else {
            key ^ (1u64 << 63) // was positive
        };
        data[i] = f64::from_bits(bits);
    }
}

/// Sort an array of i64 values in-place using radix sort (signed).
#[no_mangle]
pub unsafe extern "C" fn tova_sort_i64(ptr: *mut i64, len: usize) {
    if len <= 1 {
        return;
    }
    let data = slice::from_raw_parts_mut(ptr, len);

    if len <= 64 {
        insertion_sort_i64(data);
        return;
    }

    radix_sort_i64(data);
}

fn insertion_sort_i64(data: &mut [i64]) {
    for i in 1..data.len() {
        let key = data[i];
        let mut j = i;
        while j > 0 && data[j - 1] > key {
            data[j] = data[j - 1];
            j -= 1;
        }
        data[j] = key;
    }
}

fn radix_sort_i64(data: &mut [i64]) {
    let len = data.len();
    let mut keys: Vec<u64> = Vec::with_capacity(len);
    let mut buf: Vec<u64> = vec![0u64; len];

    // Convert signed to unsigned by flipping the sign bit
    for &val in data.iter() {
        keys.push((val as u64) ^ (1u64 << 63));
    }

    // 4-pass radix sort on 16-bit chunks
    for pass in 0..4u32 {
        let shift = pass * 16;
        let mut counts = [0u32; 65536];

        for &key in keys.iter() {
            let digit = ((key >> shift) & 0xFFFF) as usize;
            counts[digit] += 1;
        }

        let mut total = 0u32;
        for count in counts.iter_mut() {
            let c = *count;
            *count = total;
            total += c;
        }

        for &key in keys.iter() {
            let digit = ((key >> shift) & 0xFFFF) as usize;
            let pos = counts[digit] as usize;
            buf[pos] = key;
            counts[digit] += 1;
        }

        std::mem::swap(&mut keys, &mut buf);
    }

    // Convert back to signed
    for (i, &key) in keys.iter().enumerate() {
        data[i] = (key ^ (1u64 << 63)) as i64;
    }
}

// ============================================================
// Array utilities
// ============================================================

/// Remove duplicates from a sorted i64 array. Returns new length.
#[no_mangle]
pub unsafe extern "C" fn tova_unique_sorted_i64(ptr: *mut i64, len: usize) -> usize {
    if len <= 1 {
        return len;
    }
    let data = slice::from_raw_parts_mut(ptr, len);
    let mut write = 1usize;
    for read in 1..len {
        if data[read] != data[write - 1] {
            data[write] = data[read];
            write += 1;
        }
    }
    write
}

/// Remove duplicates from a sorted f64 array. Returns new length.
#[no_mangle]
pub unsafe extern "C" fn tova_unique_sorted_f64(ptr: *mut f64, len: usize) -> usize {
    if len <= 1 {
        return len;
    }
    let data = slice::from_raw_parts_mut(ptr, len);
    let mut write = 1usize;
    for read in 1..len {
        if data[read] != data[write - 1] {
            data[write] = data[read];
            write += 1;
        }
    }
    write
}

/// Sum an array of f64 values using Kahan summation (compensated, more accurate).
#[no_mangle]
pub unsafe extern "C" fn tova_sum_f64(ptr: *const f64, len: usize) -> f64 {
    if len == 0 {
        return 0.0;
    }
    let data = slice::from_raw_parts(ptr, len);
    let mut sum = 0.0f64;
    let mut comp = 0.0f64; // compensation for lost low-order bits
    for &val in data.iter() {
        let y = val - comp;
        let t = sum + y;
        comp = (t - sum) - y;
        sum = t;
    }
    sum
}

/// Find the minimum value in an f64 array.
#[no_mangle]
pub unsafe extern "C" fn tova_min_f64(ptr: *const f64, len: usize) -> f64 {
    if len == 0 {
        return f64::NAN;
    }
    let data = slice::from_raw_parts(ptr, len);
    let mut m = data[0];
    for &val in data.iter().skip(1) {
        if val < m {
            m = val;
        }
    }
    m
}

/// Find the maximum value in an f64 array.
#[no_mangle]
pub unsafe extern "C" fn tova_max_f64(ptr: *const f64, len: usize) -> f64 {
    if len == 0 {
        return f64::NAN;
    }
    let data = slice::from_raw_parts(ptr, len);
    let mut m = data[0];
    for &val in data.iter().skip(1) {
        if val > m {
            m = val;
        }
    }
    m
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sort_f64() {
        let mut data = vec![3.14, -1.0, 2.71, 0.0, -0.5, 100.0, -100.0, 1.0];
        unsafe { tova_sort_f64(data.as_mut_ptr(), data.len()); }
        assert_eq!(data, vec![-100.0, -1.0, -0.5, 0.0, 1.0, 2.71, 3.14, 100.0]);
    }

    #[test]
    fn test_sort_f64_large() {
        let mut data: Vec<f64> = (0..10000).map(|i| (10000 - i) as f64).collect();
        unsafe { tova_sort_f64(data.as_mut_ptr(), data.len()); }
        let expected: Vec<f64> = (1..=10000).map(|i| i as f64).collect();
        assert_eq!(data, expected);
    }

    #[test]
    fn test_sort_f64_negative() {
        let mut data = vec![-3.0, -1.0, -2.0];
        unsafe { tova_sort_f64(data.as_mut_ptr(), data.len()); }
        assert_eq!(data, vec![-3.0, -2.0, -1.0]);
    }

    #[test]
    fn test_sort_i64() {
        let mut data = vec![5i64, -3, 0, 10, -1, 7, 2];
        unsafe { tova_sort_i64(data.as_mut_ptr(), data.len()); }
        assert_eq!(data, vec![-3, -1, 0, 2, 5, 7, 10]);
    }

    #[test]
    fn test_sort_i64_large() {
        let mut data: Vec<i64> = (0..10000).map(|i| 5000 - i).collect();
        unsafe { tova_sort_i64(data.as_mut_ptr(), data.len()); }
        let expected: Vec<i64> = (-4999..=5000).collect();
        assert_eq!(data, expected);
    }

    #[test]
    fn test_unique_sorted() {
        let mut data = vec![1i64, 1, 2, 2, 3, 3, 3, 4];
        let new_len = unsafe { tova_unique_sorted_i64(data.as_mut_ptr(), data.len()) };
        assert_eq!(new_len, 4);
        assert_eq!(&data[..new_len], &[1, 2, 3, 4]);
    }

    #[test]
    fn test_sum_f64() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let sum = unsafe { tova_sum_f64(data.as_ptr(), data.len()) };
        assert_eq!(sum, 15.0);
    }

    #[test]
    fn test_min_max_f64() {
        let data = vec![3.0, 1.0, 4.0, 1.5, 9.0, 2.6];
        let min = unsafe { tova_min_f64(data.as_ptr(), data.len()) };
        let max = unsafe { tova_max_f64(data.as_ptr(), data.len()) };
        assert_eq!(min, 1.0);
        assert_eq!(max, 9.0);
    }
}
