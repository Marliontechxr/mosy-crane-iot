/**
 * espnow_fallback.h — ESP-NOW broadcast fallback when WiFi drops.
 * Blueprint Section 7 — peer-to-peer backup communication.
 */
#pragma once

#ifndef NATIVE_TEST

#include <cstdint>

/** Initialize ESP-NOW with peer MAC address. */
bool espnow_init(const uint8_t* peer_mac, uint8_t channel);

/**
 * Send data via ESP-NOW broadcast.
 * Maximum payload: 250 bytes.
 *
 * @param data Pointer to data buffer
 * @param len Length of data (max 250)
 * @return true if send was queued successfully
 */
bool espnow_send(const uint8_t* data, size_t len);

/** Check if ESP-NOW is initialized. */
bool espnow_is_ready();

#endif
