package dev.androiduse.accessibility;

import android.accessibilityservice.AccessibilityService;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Rect;
import android.os.Build;
import android.util.Xml;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import org.xmlpull.v1.XmlSerializer;
import java.io.File;
import java.io.StringWriter;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/** On-demand reads only. The shell sender needs DUMP; service enablement is manual. */
public final class HierarchyService extends AccessibilityService {
  private BroadcastReceiver receiver;
  private int nodes;
  @Override protected void onServiceConnected() {
    if (receiver != null) return;
    receiver = new BroadcastReceiver() {
      @Override public void onReceive(Context context, Intent intent) {
        String id = intent.getStringExtra("requestId");
        if (id == null || !id.matches("[a-f0-9-]{36}")) { setResultData("INVALID_REQUEST"); return; }
        File target = new File(getFilesDir(), id + ".xml");
        try {
          AccessibilityNodeInfo root = getRootInActiveWindow();
          if (root == null) { setResultData("ROOT_UNAVAILABLE"); return; }
          StringWriter buffer = new StringWriter();
          XmlSerializer xml = Xml.newSerializer(); xml.setOutput(buffer);
          xml.startDocument("UTF-8", true); xml.startTag(null, "hierarchy"); nodes = 0;
          visit(xml, root, 0);
          for (AccessibilityWindowInfo window : getWindows()) {
            if (window.getType() == AccessibilityWindowInfo.TYPE_INPUT_METHOD) {
              AccessibilityNodeInfo keyboard = window.getRoot();
              if (keyboard != null) visit(xml, keyboard, 0);
            }
          }
          xml.endTag(null, "hierarchy"); xml.endDocument();
          byte[] bytes = buffer.toString().getBytes(StandardCharsets.UTF_8);
          if (bytes.length > 2 * 1024 * 1024) throw new Exception("LIMIT");
          try (FileOutputStream stream = new FileOutputStream(target)) { stream.write(bytes); }
          setResultData("OK " + id);
        } catch (Exception e) { target.delete(); setResultData("CAPTURE_FAILED"); }
      }
    };
    IntentFilter filter = new IntentFilter("dev.androiduse.accessibility.CAPTURE");
    if (Build.VERSION.SDK_INT >= 33)
      registerReceiver(receiver, filter, "android.permission.DUMP", null, Context.RECEIVER_EXPORTED);
    else registerReceiver(receiver, filter, "android.permission.DUMP", null);
  }
  private static String string(CharSequence value) { return value == null ? "" : value.toString(); }
  private void visit(XmlSerializer xml, AccessibilityNodeInfo node, int depth) throws Exception {
    try {
      if (++nodes > 5000 || depth > 64) throw new Exception("LIMIT");
      if (!node.isVisibleToUser()) return;
      Rect b = new Rect(); node.getBoundsInScreen(b);
      xml.startTag(null, "node");
      xml.attribute(null, "bounds", "[" + b.left + "," + b.top + "][" + b.right + "," + b.bottom + "]");
      xml.attribute(null, "text", node.isPassword() ? "" : string(node.getText()));
      xml.attribute(null, "content-desc", node.isPassword() ? "" : string(node.getContentDescription()));
      xml.attribute(null, "resource-id", string(node.getViewIdResourceName()));
      xml.attribute(null, "class", string(node.getClassName()));
      xml.attribute(null, "clickable", String.valueOf(node.isClickable()));
      xml.attribute(null, "long-clickable", String.valueOf(node.isLongClickable()));
      xml.attribute(null, "editable", String.valueOf(node.isEditable()));
      xml.attribute(null, "focused", String.valueOf(node.isFocused()));
      xml.attribute(null, "enabled", String.valueOf(node.isEnabled()));
      xml.attribute(null, "password", String.valueOf(node.isPassword()));
      xml.attribute(null, "scrollable", String.valueOf(node.isScrollable()));
      for (int i = 0; i < node.getChildCount(); i++) {
        AccessibilityNodeInfo child = node.getChild(i); if (child != null) visit(xml, child, depth + 1);
      }
      xml.endTag(null, "node");
    } finally { node.recycle(); }
  }
  @Override public void onAccessibilityEvent(AccessibilityEvent event) {}
  @Override public void onInterrupt() {}
  @Override public void onDestroy() {
    if (receiver != null) { unregisterReceiver(receiver); receiver = null; }
    super.onDestroy();
  }
}
