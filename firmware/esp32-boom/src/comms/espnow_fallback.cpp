/**
 * espnow_fallback.cpp — ESP-NOW peer-to-peer fallback communication.
 * Blueprint Section 7 — broadcast when WiFi/MQTT unavailable.
 */
#ifndef NATIVE_TEST

#include "espnow_fallback.h"
#include "../config.h"
#include <esp_now.h>
#include <WiFi.h>

static bool espnow_ready = false;
static uint8_t peer_addr[6];

static void on_send_cb(const uint8_t* mac, esp_now_send_status_t status) {
  // Could track delivery status for diagnostics
  (void)mac;
  (void)status;
}

bool espnow_init(const uint8_t* peer_mac, uint8_t channel) {
  memcpy(peer_addr, peer_mac, 6);

  if (esp_now_init() != ESP_OK) {
    return false;
  }

  esp_now_register_send_cb(on_send_cb);

  // Register peer
  esp_now_peer_info_t peer_info = {};
  memcpy(peer_info.peer_addr, peer_mac, 6);
  peer_info.channel = channel;
  peer_info.encrypt = false;

  if (esp_now_add_peer(&peer_info) != ESP_OK) {
    return false;
  }

  espnow_ready = true;
  return true;
}

bool espnow_send(const uint8_t* data, size_t len) {
  if (!espnow_ready || len > 250) return false;
  return esp_now_send(peer_addr, data, len) == ESP_OK;
}

bool espnow_is_ready() {
  return espnow_ready;
}

#endif
