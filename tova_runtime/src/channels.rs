use crossbeam_channel::{bounded, Sender, Receiver};
use std::collections::HashMap;
use std::sync::Mutex;
use once_cell::sync::Lazy;

struct ChannelEntry {
    sender: Sender<i64>,
    receiver: Receiver<i64>,
    closed: bool,
}

static CHANNELS: Lazy<Mutex<HashMap<u64, ChannelEntry>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

static NEXT_ID: Lazy<Mutex<u64>> = Lazy::new(|| Mutex::new(0));

pub fn create(capacity: u32) -> u64 {
    let cap = if capacity == 0 { 0 } else { capacity as usize };
    let (sender, receiver) = bounded(cap);
    let mut id_lock = NEXT_ID.lock().unwrap();
    let id = *id_lock;
    *id_lock += 1;
    drop(id_lock);
    let mut channels = CHANNELS.lock().unwrap();
    channels.insert(id, ChannelEntry { sender, receiver, closed: false });
    id
}

pub fn send(id: u64, value: i64) -> bool {
    let channels = CHANNELS.lock().unwrap();
    if let Some(entry) = channels.get(&id) {
        if entry.closed { return false; }
        let sender = entry.sender.clone();
        drop(channels);
        sender.send(value).is_ok()
    } else {
        false
    }
}

pub fn receive(id: u64) -> Option<i64> {
    let channels = CHANNELS.lock().unwrap();
    if let Some(entry) = channels.get(&id) {
        let receiver = entry.receiver.clone();
        let closed = entry.closed;
        drop(channels);
        match receiver.try_recv() {
            Ok(val) => Some(val),
            Err(_) => {
                // If closed and buffer drained, clean up the entry
                if closed {
                    let mut channels = CHANNELS.lock().unwrap();
                    channels.remove(&id);
                }
                None
            }
        }
    } else {
        None
    }
}

pub fn receive_blocking(id: u64) -> Option<i64> {
    let channels = CHANNELS.lock().unwrap();
    if let Some(entry) = channels.get(&id) {
        let receiver = entry.receiver.clone();
        let closed = entry.closed;
        drop(channels);
        match receiver.recv() {
            Ok(val) => Some(val),
            Err(_) => {
                // If closed and buffer drained, clean up the entry
                if closed {
                    let mut channels = CHANNELS.lock().unwrap();
                    channels.remove(&id);
                }
                None
            }
        }
    } else {
        None
    }
}

pub fn close(id: u64) {
    let mut channels = CHANNELS.lock().unwrap();
    // Drop the original sender to signal disconnection to receivers
    if let Some(entry) = channels.remove(&id) {
        let real_receiver = entry.receiver.clone();
        drop(entry.sender); // Drop original sender
        // If buffer is already empty, no need to keep the entry around
        if real_receiver.is_empty() {
            return;
        }
        channels.insert(id, ChannelEntry {
            sender: bounded(0).0, // dead sender (no corresponding receiver)
            receiver: real_receiver,
            closed: true,
        });
    }
}

pub fn destroy(id: u64) {
    let mut channels = CHANNELS.lock().unwrap();
    channels.remove(&id);
}
