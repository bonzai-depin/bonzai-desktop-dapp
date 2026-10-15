import { get } from '../db/connection.js';

// Only deterministic rehearsal teams are disposable, never user-created sample teams.
export function clearBusinessDemos() {
 const {db}=get();
 const ids=db.prepare("SELECT id FROM companies WHERE json_valid(charter) AND json_extract(charter, '$.demoRun') = 1").all().map(r=>r.id);
 if(!ids.length)return 0;
 const quote=name=>'"'+name.replaceAll('"','""')+'"';
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>({name:r.name,columns:db.prepare('PRAGMA table_info('+quote(r.name)+')').all().map(c=>c.name)}));
 db.transaction(()=>{
  db.pragma('defer_foreign_keys = ON');
  for(const id of ids){
   if(tables.some(t=>t.name==='issue_attempts'))
    db.prepare('DELETE FROM issue_attempts WHERE issue_id IN (SELECT id FROM issues WHERE company_id=?)').run(id);
   if(tables.some(t=>t.name==='memory_instances')){
    const memories=db.prepare("SELECT instance_key FROM memory_instances WHERE (scope='company' AND identity_id=?) OR (scope='team' AND json_extract(metadata_json,'$.companyId')=?)").all(id,id);
    for(const memory of memories){
     for(const table of tables.filter(t=>t.name !== 'memory_instances' && t.columns.includes('instance_key')))
      db.prepare('DELETE FROM '+quote(table.name)+' WHERE instance_key=?').run(memory.instance_key);
     db.prepare('DELETE FROM memory_instances WHERE instance_key=?').run(memory.instance_key);
    }
   }
   for(const table of tables.filter(t=>t.columns.includes('company_id')))
    db.prepare('DELETE FROM '+quote(table.name)+' WHERE company_id=?').run(id);
   db.prepare('DELETE FROM companies WHERE id=?').run(id);
  }
 })();
 return ids.length;
}
