import * as L from '../js/lib.js';
import assert from 'node:assert/strict';
let n=0; const t=(name,fn)=>{fn();n++;console.log('ok',name)};

t('toLoginEmail',()=>{
  assert.equal(L.toLoginEmail('Nguyễn Văn A'),'nguyenvana@quiz.local');
  assert.equal(L.toLoginEmail('HS01'),'hs01@quiz.local');
  assert.equal(L.toLoginEmail('a@b.com'),'a@b.com');
  assert.equal(L.toLoginEmail('a@b'),'');
  assert.equal(L.toLoginEmail('   '),'');
});
t('normalizeAnswer',()=>{
  for (const [i,o] of [['b','B'],['(C)','C'],['2','B'],['Đáp án: D','D'],['',''],['E',''],['AB','']]) assert.equal(L.normalizeAnswer(i),o,i);
});
t('rowsToQuestions xlsx headers',()=>{
  const r=L.rowsToQuestions([
    {STT:1,'Mã câu':'C01','Câu hỏi':'1+1?',A:'1',B:'2',C:'3',D:'4','Đáp án':'B','Giải thích':'đơn giản'},
    {STT:2,'Mã câu':'','Câu hỏi':'Q2',A:'x',B:'y',C:'',D:'','Đáp án':'a','Giải thích':''},
    {STT:3,'Mã câu':'C01','Câu hỏi':'Trùng mã',A:'x',B:'y',C:'',D:'',  'Đáp án':'B'},
    {'Câu hỏi':'thiếu đáp án',A:'x',B:'y','Đáp án':''},
    {'Câu hỏi':'đáp án trỏ ô trống',A:'x',B:'y',C:'',D:'','Đáp án':'C'},
    {'Câu hỏi':'',A:'',B:'',C:'',D:'','Đáp án':''},
    {'Câu hỏi':'chỉ 1 đáp án',A:'x','Đáp án':'A'},
  ]);
  assert.equal(r.questions.length,3);
  assert.deepEqual(r.questions.map(q=>q.id),['C01','q2','C01_2']);
  assert.equal(r.errors.length,3);
  assert.ok(r.errors[0].startsWith('Dòng 5'));
});
t('json keys',()=>{
  const r=L.rowsToQuestions([{id:'k1',q:'hi',A:'a',B:'b',ans:'A',exp:'e'}]);
  assert.equal(r.questions[0].id,'k1'); assert.equal(r.questions[0].exp,'e');
});
t('parse text Word',()=>{
  const txt=`Câu 1: Thủ đô VN?
A. Hà Nội
B. Huế
C. Đà Nẵng
D. HCM
Đáp án: A
Giải thích: Hà Nội
là thủ đô.

Câu 2. Tính $1+1$
bằng mấy?
A) 1
*B) 2
C) 3
Đáp án B

3. Câu không tiền tố
A. x
B. y
Đáp án: B
Một dòng thường là câu mới
a. m
b. n
Đáp án: a`;
  const r=L.parseQuestionText(txt);
  assert.equal(r.errors.length,0,r.errors.join('|'));
  assert.equal(r.questions.length,4);
  assert.equal(r.questions[0].exp,'Hà Nội\nlà thủ đô.');
  assert.equal(r.questions[1].q,'Tính $1+1$\nbằng mấy?');
  assert.equal(r.questions[1].ans,'B');
  assert.equal(r.questions[2].q,'Câu không tiền tố');
  assert.equal(r.questions[3].q,'Một dòng thường là câu mới');
  assert.equal(r.questions[3].ans,'A');
});
t('export→import round trip (xlsx rows & word text)',()=>{
  const qs=L.sampleQuestions();
  const back=L.rowsToQuestions(L.questionsToRows(qs));
  assert.deepEqual(back.questions,qs.map(q=>({...q})));
  const html=L.questionsToWordHtml('T',qs);
  const text=html.replace(/<h2>.*?<\/h2>/,'').replace(/<\/p>/g,'\n').replace(/<br>/g,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,'').replace(/&amp;/g,'&');
  const r2=L.parseQuestionText(text);
  assert.equal(r2.errors.length,0,r2.errors.join('|'));
  assert.equal(r2.questions.length,3);
  assert.deepEqual(r2.questions.map(q=>q.ans),['A','A','B']);
});
t('merge/newId',()=>{
  const m=L.mergeQuestions([{id:'q1'}],[{id:'q1'},{id:'q1'}]);
  assert.deepEqual(m.map(q=>q.id),['q1','q1_2','q1_3']);
  assert.equal(L.newQuestionId([{id:'q1'},{id:'q3'}]),'q4');
  assert.equal(L.newQuestionId([{id:'q1'},{id:'q2'}]),'q3');
});

t('plan+grade',()=>{
  const qs=L.sampleQuestions();
  const p=L.buildPlan(qs,true,true);
  assert.equal(p.qOrder.length,3); assert.deepEqual([...p.qOrder].sort(),['q1','q2','q3']);
  assert.deepEqual([...p.oOrder.q3].sort(),['A','B','C']);
  const p2=L.buildPlan(qs,false,false); assert.deepEqual(p2.qOrder,['q1','q2','q3']); assert.deepEqual(p2.oOrder.q1,['A','B','C','D']);
  const g=L.grade(qs,{q1:'A',q2:'B'}); assert.deepEqual([g.correct,g.wrong,g.blank,g.score,g.wrongIds],[1,1,1,3.33,['q2']]);
  assert.equal(L.grade(qs,{q1:'A',q2:'A',q3:'B'}).score,10);
  assert.equal(L.grade([],{}).score,0);
});
t('access',()=>{
  const now=1e12;
  const u={role:'user',className:'12A1'};
  assert.ok(L.canSee({},u,'x'));
  assert.ok(!L.canSee({hidden:true},u,'x'));
  assert.ok(L.canSee({allowedClasses:['12a1']},u,'x'));
  assert.ok(!L.canSee({allowedClasses:['12A2']},u,'x'));
  assert.ok(L.canSee({allowedUsers:['x'],allowedClasses:['zz']},u,'x'));
  assert.ok(!L.canSee({allowedUsers:['y']},u,'x'));
  assert.ok(L.canSee({allowedUsers:['y']},{role:'admin'},'x'));
  assert.ok(!L.quizAccess({openAt:now+1},now,0).ok);
  assert.ok(!L.quizAccess({closeAt:now-1},now,0).ok);
  assert.ok(!L.quizAccess({maxAttempts:2},now,2).ok);
  assert.ok(L.quizAccess({maxAttempts:0},now,99).ok);
});
t('stats',()=>{
  const qs=L.sampleQuestions();
  const A=(uid,score,w,d)=>({uid,status:'submitted',score,wrongIds:w,durationSec:d,passScore:5});
  const s=L.quizStats([A('a',10,[],100),A('a',4,['q1'],50),A('b',6,['q1','q2'],90),{uid:'c',status:'in_progress'}],qs);
  assert.equal(s.n,3); assert.equal(s.avg,20/3); assert.equal(s.passRate,2/3);
  assert.equal(s.dist[9],1); assert.equal(s.dist[4],1); assert.equal(s.dist[6],1);
  assert.deepEqual(s.ranking.map(a=>a.uid),['a','b']);
  assert.equal(s.wrongTop[0].id,'q1'); assert.equal(s.wrongTop[0].count,2);
});
t('fmt',()=>{
  assert.equal(L.fmtTime(65),'01:05'); assert.equal(L.fmtTime(3725),'1:02:05');
  const ms=new Date(2026,9,12,8,5).getTime();
  assert.equal(L.toLocalInput(ms),'2026-10-12T08:05'); assert.equal(L.fromLocalInput('2026-10-12T08:05'),ms);
  assert.equal(L.fmtScore(7.7777),'7.78');
});
console.log('TẤT CẢ',n,'nhóm test đạt');
