package com.teketeke.mpesa;

import android.Manifest;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Skeleton Capacitor plugin for reading and parsing M-Pesa SMS on Android.
 *
 * IMPORTANT:
 *  - This is only a starter; it does NOT yet read SMS.
 *  - You must implement the real permission checks, BroadcastReceiver, and parsing logic.
 *  - The web layer already expects this plugin under:
 *      window.Capacitor.Plugins.MpesaSms
 *
 * Suggested native contract (mirrors the web docs):
 *   - requestPermission()      -> ask user for RECEIVE_SMS / READ_SMS
 *   - setEnabled({enabled})    -> toggle background listening
 *   - pullNewMessages()        -> return newly parsed M-Pesa messages since last sync
 */
@CapacitorPlugin(
  name = "MpesaSms",
  permissions = {
    @Permission(
      alias = "sms",
      strings = {
        android.Manifest.permission.RECEIVE_SMS,
        android.Manifest.permission.READ_SMS
      }
    )
  }
)
public class MpesaSmsPlugin extends Plugin {

  private boolean enabled = false;

  /**
   * Ask for SMS permissions.
   * Replace this stub with real permission + rationale handling.
   */
  @com.getcapacitor.PluginMethod
  public void requestPermission(PluginCall call) {
    // If already granted, resolve immediately
    if (getPermissionState("sms") == PermissionState.GRANTED) {
      JSObject ret = new JSObject();
      ret.put("granted", true);
      ret.put("status", "granted");
      call.resolve(ret);
      return;
    }

    // Otherwise request; result handled in callback below
    requestPermissionForAlias("sms", call, "onSmsPermissionResult");
  }

  @PermissionCallback
  private void onSmsPermissionResult(PluginCall call) {
    JSObject ret = new JSObject();
    boolean granted = getPermissionState("sms") == PermissionState.GRANTED;
    ret.put("granted", granted);
    ret.put("status", granted ? "granted" : "denied");
    call.resolve(ret);
  }

  /**
   * Toggle background SMS listening.
   * In a real implementation, use this to register/unregister your BroadcastReceiver.
   */
  @com.getcapacitor.PluginMethod
  public void setEnabled(PluginCall call) {
    boolean next = call.getBoolean("enabled", false);
    this.enabled = next;
    MpesaSmsStore.setEnabled(next);

    JSObject ret = new JSObject();
    ret.put("enabled", this.enabled);
    call.resolve(ret);
  }

  /**
   * Pull newly parsed M-Pesa messages.
   *
   * A full implementation should:
   *  - Read from your own local store (e.g., Room/SQLite) where the SMS BroadcastReceiver
   *    has already saved parsed M-Pesa messages.
   *  - Mark them as "synced" once returned to JS so they are not sent twice.
   *
   * For now this returns an empty list, so the web app will simply report
   * "No new M-Pesa messages to import."
   */
  @com.getcapacitor.PluginMethod
  public void pullNewMessages(PluginCall call) {
    JSObject ret = new JSObject();
    JSArray items = new JSArray();

    for (MpesaSmsStore.MpesaItem item : MpesaSmsStore.drainItems()) {
      JSObject j = new JSObject();
      if (item.kind != null) j.put("kind", item.kind);
      j.put("amount", item.amount);
      if (item.category != null) j.put("category", item.category);
      if (item.counterparty != null) j.put("counterparty", item.counterparty);
      if (item.mpesaRef != null) j.put("mpesa_ref", item.mpesaRef);
      if (item.description != null) j.put("description", item.description);
      if (item.occurredAtIso != null) j.put("occurred_at", item.occurredAtIso);
      items.put(j);
    }

    ret.put("items", items);
    call.resolve(ret);
  }
}

