package dev.androiduse.ime;
import android.inputmethodservice.InputMethodService;
import android.content.*;
import android.os.Build;
import android.view.View;
import android.view.inputmethod.*;
import android.widget.TextView;
import android.util.Base64;
import android.text.InputType;
import org.json.JSONObject;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.util.UUID;
import java.util.HashSet;
public final class UnicodeIme extends InputMethodService {
 private boolean active;private String generation="";private final HashSet<String> requests=new HashSet<>();
 private boolean password(EditorInfo e){int type=e.inputType&InputType.TYPE_MASK_CLASS,v=e.inputType&InputType.TYPE_MASK_VARIATION;return (type==InputType.TYPE_CLASS_TEXT&&(v==InputType.TYPE_TEXT_VARIATION_PASSWORD||v==InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD||v==InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD))||(type==InputType.TYPE_CLASS_NUMBER&&v==InputType.TYPE_NUMBER_VARIATION_PASSWORD);}
 private ExtractedText full(InputConnection ic){ExtractedText ex=ic.getExtractedText(new ExtractedTextRequest(),0);return ex!=null&&ex.text!=null&&ex.startOffset==0&&ex.partialStartOffset==-1&&ex.text.length()<=65536?ex:null;}
 private final BroadcastReceiver bridge=new BroadcastReceiver(){public void onReceive(Context c,Intent i){
  try{
   InputConnection ic=getCurrentInputConnection();EditorInfo e=getCurrentInputEditorInfo();
   if("dev.androiduse.ime.PROBE".equals(i.getAction())){
    JSONObject state=new JSONObject();state.put("active",active&&ic!=null&&e!=null);state.put("generation",generation);state.put("packageName",e==null?JSONObject.NULL:e.packageName);state.put("password",e!=null&&password(e));state.put("complete",active&&ic!=null&&full(ic)!=null);setResultData(Base64.encodeToString(state.toString().getBytes(StandardCharsets.UTF_8),Base64.NO_WRAP));return;
   }
   if(!active||ic==null||e==null){setResultData("NO_ACTIVE_EDITOR");return;}
   if(!generation.equals(i.getStringExtra("generation"))||!e.packageName.equals(i.getStringExtra("expectedPackage"))){setResultData("STALE_EDITOR");return;}
   if(password(e)){setResultData("PASSWORD_UNSUPPORTED");return;}
   String id=i.getStringExtra("request"),mode=i.getStringExtra("mode"),raw=i.getStringExtra("payload");
   if(id==null||!id.matches("[A-Za-z0-9_-]{1,128}")||raw==null||raw.length()>11000){setResultData("INVALID_REQUEST");return;}
   if(requests.contains(id)){setResultData("DUPLICATE");return;}if(requests.size()>=1000){setResultData("REQUEST_CACHE_FULL");return;}
   if(!"insert".equals(mode)&&!"append".equals(mode)&&!"replace".equals(mode)&&!"clear".equals(mode)){setResultData("INVALID_MODE");return;}
   byte[] decoded=Base64.decode(raw,Base64.NO_WRAP);if(decoded.length>8192){setResultData("PAYLOAD_LIMIT");return;}
   String text=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(decoded)).toString();
   if("clear".equals(mode)&&!text.isEmpty()){setResultData("INVALID_CLEAR");return;}
   ExtractedText ex="insert".equals(mode)?null:full(ic);if(!"insert".equals(mode)&&ex==null){setResultData("FULL_TEXT_UNAVAILABLE");return;}
   requests.add(id);ic.beginBatchEdit();boolean ok=false;
   try{if(ex!=null){int len=ex.text.length();if(!ic.setSelection("append".equals(mode)?len:0,len)){setResultData("SELECTION_FAILED");return;}}ok=ic.commitText(text,1);}finally{ic.endBatchEdit();}
   setResultData(ok?"COMMITTED_VERIFY_FIELD":"COMMIT_FAILED");
  }catch(Exception ex){setResultData("INPUT_ERROR");}
 }};
 @Override public void onCreate(){super.onCreate();IntentFilter filter=new IntentFilter("dev.androiduse.ime.INPUT");filter.addAction("dev.androiduse.ime.PROBE");if(Build.VERSION.SDK_INT>=33)registerReceiver(bridge,filter,"android.permission.DUMP",null,Context.RECEIVER_EXPORTED);else registerReceiver(bridge,filter,"android.permission.DUMP",null);}
 @Override public void onStartInput(EditorInfo e,boolean restart){super.onStartInput(e,restart);active=true;generation=UUID.randomUUID().toString();}
 @Override public void onFinishInput(){active=false;generation=UUID.randomUUID().toString();super.onFinishInput();}
 @Override public void onDestroy(){unregisterReceiver(bridge);super.onDestroy();}
 @Override public View onCreateInputView(){TextView v=new TextView(this);v.setText("Android Use Unicode Input\nControlled by the authorized host. Switch keyboards for manual typing.");v.setTextSize(16);v.setPadding(24,20,24,20);return v;}
}
