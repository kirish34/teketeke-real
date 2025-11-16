package com.teketeke.mpesa;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Simple in-memory store for parsed M-Pesa items.
 *
 * This is intentionally minimal:
 *  - Survives while the app process is alive.
 *  - MpesaSmsReceiver pushes new items here.
 *  - MpesaSmsPlugin.pullNewMessages() drains and returns them to JS.
 *
 * For a production app, consider persisting to Room/SQLite instead of memory.
 */
public final class MpesaSmsStore {

  public static final class MpesaItem {
    public String kind;          // "IN" or "OUT"
    public double amount;
    public String category;
    public String counterparty;
    public String mpesaRef;
    public String description;
    public String occurredAtIso;
  }

  private static final List<MpesaItem> BUFFER =
    Collections.synchronizedList(new ArrayList<>());

  private static volatile boolean enabled = false;

  private MpesaSmsStore() {}

  public static void setEnabled(boolean value) {
    enabled = value;
  }

  public static boolean isEnabled() {
    return enabled;
  }

  public static void add(MpesaItem item) {
    if (!enabled || item == null) return;
    BUFFER.add(item);
  }

  public static List<MpesaItem> drainItems() {
    List<MpesaItem> out = new ArrayList<>();
    synchronized (BUFFER) {
      out.addAll(BUFFER);
      BUFFER.clear();
    }
    return out;
  }
}

