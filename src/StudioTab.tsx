import { useState } from 'react';
import { generateContentMachineJson, type ProjectBuilderConfig } from './generator';
import { DownloadSimple, TextAlignLeft, VideoCamera, Target } from '@phosphor-icons/react';

export function StudioTab() {
  const [config, setConfig] = useState<{
    projectName: string;
    numRows: number;
    maxScenes: number;
    sceneDuration: number;
    includeAvatar: boolean;
    contextPrompt: string;
    pdfUrl?: string;
    precalculatedRows?: string[];
    inheritedDatasetRow?: any;
  }>({
    projectName: '',
    numRows: 8,
    maxScenes: 24,
    sceneDuration: 2,
    includeAvatar: false,
    contextPrompt: ''
  });
  const [pendingDataset, setPendingDataset] = useState<any[] | null>(null);
  const [parsedProjectSettings, setParsedProjectSettings] = useState<any>(null);

  const wordCountPerScene = Math.ceil(config.sceneDuration * 140);

  const handleGenerate = async () => {
    try {
      const compiledConfig: ProjectBuilderConfig = {
        projectName: config.projectName,
        numRows: config.numRows,
        includeAvatar: config.includeAvatar,
        contextPrompt: config.contextPrompt,
        maxScenes: config.maxScenes,
        wordCountPerScene,
        pdfUrl: config.pdfUrl,
        precalculatedRows: config.precalculatedRows,
        inheritedProject: parsedProjectSettings,
        inheritedDatasetRow: config.inheritedDatasetRow
      };

      const compiledJson = generateContentMachineJson(compiledConfig);
      const fileName = `${config.projectName || 'W.Academy_Corso'}_export.json`;

      // Seleziona preferibilmente il nativo Electron per far scegliere cartella (Save As)
      if (window.electronAPI && window.electronAPI.saveProjectJson) {
         const res = await window.electronAPI.saveProjectJson({
           defaultName: fileName,
           content: JSON.stringify(compiledJson, null, 2)
         });
         if (res && res.success) {
           alert('✅ Progetto salvato con successo!');
         }
         return;
      }
      
      // Fallback per test web
      const blob = new Blob([JSON.stringify(compiledJson, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      alert('✅ Progetto Content Machine generato con successo!');
    } catch (err) {
      alert(`❌ Errore durante la generazione: ${(err as Error).message}`);
    }
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json.dataset || json.dataset.length === 0) {
           alert("Nessun dataset trovato in questo JSON!");
           return;
        }
        
        if (json.project) {
          setParsedProjectSettings(json);
        }
        
        if (json.dataset.length > 1) {
           setPendingDataset(json.dataset);
           return;
        }
        applyDatasetRow(json.dataset[0].data);
      } catch(err) {
        console.error("JSON Import Error:", err);
        alert(`❌ Errore durante la lettura del JSON: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const applyDatasetRow = (rowDataObj: any) => {
    let rowData = rowDataObj.it || Object.values(rowDataObj)[0] || {};
    
    const newNumRows = parseInt(rowData.numero_lezioni, 10) || config.numRows;
    
    let targetSceneDur = config.sceneDuration;
    if (rowData.durata_scena_minuti) {
       const match = String(rowData.durata_scena_minuti).match(/(\d+)/);
       if (match) targetSceneDur = parseFloat(match[1]);
    }
    
    let targetMaxScenes = config.maxScenes;
    if (rowData.scene_per_lezione) {
       targetMaxScenes = parseInt(rowData.scene_per_lezione, 10) || targetMaxScenes;
    }
    
    const pianoText = rowData.piano_corso || "";
    const precalculatedRows: string[] = [];
    const lezioniBlocks = pianoText.split(/LEZIONE \d+:/i).filter(Boolean);
    lezioniBlocks.forEach((block: string, i: number) => {
       precalculatedRows.push(`LEZIONE ${i+1}: ${block.trim()}`);
    });

    setConfig(prev => ({
      ...prev,
      projectName: rowData.titolo_corso || prev.projectName,
      contextPrompt: rowData.indicazioni || prev.contextPrompt,
      numRows: newNumRows,
      maxScenes: targetMaxScenes,
      sceneDuration: targetSceneDur,
      pdfUrl: rowData.documento_pdf || prev.pdfUrl,
      precalculatedRows,
      inheritedDatasetRow: rowData
    }));
    
    setPendingDataset(null);
    alert(`✅ JSON Pianificatore importato! Trovate ${precalculatedRows.length} lezioni.`);
  };

  const totalAssets = (config.numRows * config.maxScenes * (config.includeAvatar ? 4 : 2)) + config.numRows;

  return (
    <div className="tab-studio">
      
      {pendingDataset && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', padding: 24, borderRadius: 12, width: '90%', maxWidth: 600, border: '1px solid var(--border)' }}>
            <h2 style={{ marginTop: 0, marginBottom: 8, color: 'var(--text)' }}>Scegli la riga da importare</h2>
            <p style={{ color: 'var(--text-dim)', marginBottom: 20 }}>Il file contiene più righe/progetti generati. Quale vuoi usare per questo corso?</p>
            
            <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendingDataset.map((row, idx) => {
                const data = row.data?.it || Object.values(row.data || {})[0] || {};
                return (
                  <div key={idx} style={{ background: 'var(--bg)', padding: 16, borderRadius: 8, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', color: 'var(--accent)', fontSize: 16 }}>{data.titolo_corso || `Progetto #${idx+1}`}</div>
                      <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>
                        Lezioni: {data.numero_lezioni || '?'} | Target: {String(data.indicazioni || '').substring(0, 60)}{String(data.indicazioni || '').length > 60 ? '...' : ''}
                      </div>
                    </div>
                    <button className="btn-generate" style={{ padding: '6px 12px', fontSize: 13, margin: 0 }} onClick={() => applyDatasetRow(row.data)}>
                      Importa
                    </button>
                  </div>
                );
              })}
            </div>
            
            <div style={{ marginTop: 20, textAlign: 'right' }}>
              <button 
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 4, cursor: 'pointer' }}
                onClick={() => setPendingDataset(null)}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="studio-container">
        
        {/* LEFT COLUMN: FORM */}
        <div className="studio-form">
          <div className="studio-section" style={{ background: 'var(--accent-dim)', borderColor: 'var(--accent)' }}>
            <h3 style={{ margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>⚡ Importa Pianificatore</span>
               <label className="btn-generate" style={{ margin: 0, padding: '8px 16px', cursor: 'pointer', fontSize: 13, background: 'var(--bg)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>
                 Scegli File JSON...
                 <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportJson} />
               </label>
            </h3>
            <div style={{ fontSize: 13, color: 'var(--text)' }}>
              Seleziona l'export JSON del "Pianificatore Corso" per pre-compilare automaticamente tutte le lezioni, i tempi e il documento PDF.
            </div>
            {config.pdfUrl && (
              <div style={{ marginTop: 8, fontSize: 12, padding: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)' }}>
                ✅ PDF agganciato e {config.precalculatedRows?.length || 0} lezioni estratte dal piano!
              </div>
            )}
          </div>

          <div className="studio-section">
            <h3><Target size={20} /> Informazioni Generali</h3>
            <div className="form-group">
              <label>Nome Progetto</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="Es. Contrattualistica EXPORT - Parte 2"
                value={config.projectName}
                onChange={e => setConfig(prev => ({ ...prev, projectName: e.target.value }))}
              />
            </div>
          </div>

          {/* RIMOSSO IL BLOCCO 'Struttura del Corso' DA QUI in favore della colonna destra */}

          <div className="studio-section">
            <h3><VideoCamera size={20} /> Moduli e Asset</h3>
            <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>Docente Avatar AI</div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>
                  Genera foto presentatore, intro video Veo e script di apertura.
                </div>
              </div>
              <label className="toggle-switch-small">
                <div className="toggle-switch">
                  <input 
                    type="checkbox" 
                    checked={config.includeAvatar} 
                    onChange={e => setConfig(prev => ({ ...prev, includeAvatar: e.target.checked }))} 
                  />
                  <span className="toggle-slider"></span>
                </div>
              </label>
            </div>
          </div>

          <div className="studio-section">
            <h3><TextAlignLeft size={20} /> Contesto & Art Direction</h3>
            <div className="form-group">
              <label>A che target parliamo? Qual è il tono e l'obiettivo didattico? (Opzionale ma altamente raccomandato)</label>
              <textarea 
                className="form-control"
                placeholder="Es. Il corso si rivolge a neolaureati e addetti back-office. Il tono deve essere squisitamente professionale, estremamente chiaro e conciso. Non usare termini informali."
                value={config.contextPrompt}
                onChange={e => setConfig(prev => ({ ...prev, contextPrompt: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: SUMMARY */}
        <div>
          <div className="studio-summary">
            <h3>Riepilogo Progetto</h3>
            
            <div className="summary-stat" style={{ alignItems: 'center' }}>
              <span style={{color: 'var(--text-dim)'}}>Lezioni (Righe):</span>
              <input 
                type="number" 
                style={{ width: 60, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', textAlign: 'right', fontWeight: 'bold', fontSize: 14 }}
                value={config.numRows}
                min={1} max={50}
                onChange={e => setConfig(prev => ({ ...prev, numRows: Math.max(1, parseInt(e.target.value || '1', 10)) }))}
              />
            </div>
            
            <div className="summary-stat" style={{ alignItems: 'center' }}>
              <span style={{color: 'var(--text-dim)'}}>Scene per Lezione:</span>
              <input 
                type="number" 
                style={{ width: 60, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', textAlign: 'right', fontWeight: 'bold', fontSize: 14 }}
                value={config.maxScenes}
                min={1} max={100}
                onChange={e => setConfig(prev => ({ ...prev, maxScenes: Math.max(1, parseInt(e.target.value || '1', 10)) }))}
              />
            </div>

            <div className="summary-stat" style={{ alignItems: 'center' }}>
              <span style={{color: 'var(--text-dim)'}}>Durata Scena (min):</span>
              <input 
                type="number" 
                style={{ width: 60, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', textAlign: 'right', fontWeight: 'bold', fontSize: 14 }}
                value={config.sceneDuration}
                step={0.5} min={0.5}
                onChange={e => setConfig(prev => ({ ...prev, sceneDuration: Math.max(0.5, parseFloat(e.target.value || '1')) }))}
              />
            </div>
            
            <div className="summary-stat">
              <span style={{color: 'var(--text-dim)'}}>Durata Totale Lezione (Stima):</span>
              <span style={{fontWeight: 'bold'}}>{config.maxScenes * config.sceneDuration} min</span>
            </div>

            <div style={{ margin: '8px 0', fontSize: 13, color: 'var(--accent)', background: 'var(--accent-dim)', padding: 8, borderRadius: 6 }}>
               Vincolo AI Testi Parola: <b>~{wordCountPerScene} parole</b> / scena.
            </div>
            
            <div style={{ margin: '16px 0', borderTop: '1px solid var(--border)' }}></div>

            <div className="summary-stat">
              <span>Rounds AI Previsti:</span>
              <span>{Math.ceil(config.maxScenes / 8) + (config.includeAvatar ? 3 : 1)} Passaggi</span>
            </div>

            <div className="summary-stat">
              <span>Asset previsti (da generare in CM):</span>
              <span>{totalAssets} file multimediali</span>
            </div>
            
            <button className="btn-generate" onClick={handleGenerate}>
              <DownloadSimple size={20} weight="bold" /> Scarica JSON per W.A Factory
            </button>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', marginTop: -4 }}>
              Salva il file e caricalo nell'ambiente Company.AI Admin
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
