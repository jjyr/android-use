package dev.androiduse.fixture;
import android.app.Activity;
import android.os.Bundle;
import android.view.MotionEvent;
import android.widget.*;
import android.text.*;
import android.view.inputmethod.InputMethodManager;
import android.content.Context;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
public class FixtureActivity extends Activity {
 private int longCount;private float downX,downY;private long downAt;
 public void onCreate(Bundle b){super.onCreate(b);getWindow().addFlags(128);
  LinearLayout box=new LinearLayout(this);box.setOrientation(1);box.setPadding(25,30,25,20);setContentView(box);
  TextView title=new TextView(this);title.setText("Android Use native input fixture");title.setTextSize(22);box.addView(title);
  add(box,1001,"Single line",true);add(box,1002,"Multiline",false);
  Button press=new Button(this);press.setText("Long press count 0");box.addView(press);press.setOnLongClickListener(v->{press.setText("Long press count "+(++longCount));return true;});
  TextView gesture=new TextView(this);gesture.setText("Gesture pad ready");gesture.setBackgroundColor(0xffd8eef8);box.addView(gesture,new LinearLayout.LayoutParams(-1,220));
  gesture.setOnTouchListener((v,event)->{if(event.getAction()==MotionEvent.ACTION_DOWN){downX=event.getX();downY=event.getY();downAt=event.getEventTime();return true;}if(event.getAction()==MotionEvent.ACTION_UP){gesture.setText("GESTURE dx="+Math.round(event.getX()-downX)+" dy="+Math.round(event.getY()-downY)+" duration="+(event.getEventTime()-downAt));return true;}return true;});
  TextView status=new TextView(this);status.setText("SCROLL y=0");box.addView(status);ScrollView scroll=new ScrollView(this);LinearLayout rows=new LinearLayout(this);rows.setOrientation(1);for(int n=0;n<30;n++){TextView row=new TextView(this);row.setText("Scroll row "+n);row.setPadding(10,20,10,20);rows.addView(row);}scroll.addView(rows);box.addView(scroll,new LinearLayout.LayoutParams(-1,280));scroll.setOnScrollChangeListener((v,x,y,oldX,oldY)->status.setText("SCROLL y="+y));
  Button hide=new Button(this);hide.setText("Hide keyboard");box.addView(hide);hide.setOnClickListener(v->((InputMethodManager)getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(v.getWindowToken(),0));
 }
 private void add(LinearLayout box,int id,String label,boolean single){
  TextView t=new TextView(this);t.setText(label);box.addView(t);
  EditText edit=new EditText(this);edit.setId(id);edit.setSingleLine(single);if(!single){edit.setInputType(131073);edit.setMinLines(3);}box.addView(edit,new LinearLayout.LayoutParams(-1,-2));
  TextView out=new TextView(this);out.setTextSize(12);box.addView(out);
  edit.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int st,int c,int a){}public void onTextChanged(CharSequence s,int st,int before,int count){update(out,id,s.toString());}public void afterTextChanged(Editable e){}});update(out,id,"");
 }
 private void update(TextView v,int id,String text){try{byte[] h=MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));StringBuilder hex=new StringBuilder();for(byte x:h)hex.append(String.format("%02x",x&255));v.setText("FIELD "+id+" SHA256 "+hex+" LENGTH "+text.length());}catch(Exception e){v.setText("HASH_ERROR");}}
}
