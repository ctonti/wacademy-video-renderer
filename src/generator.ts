export interface ProjectBuilderConfig {
  projectName: string;
  numRows: number;
  maxScenes: number;
  includeAvatar: boolean;
  contextPrompt: string;
  wordCountPerScene: number;
  pdfUrl?: string;
  precalculatedRows?: string[];
  inheritedProject?: any;
  inheritedDatasetRow?: any;
}

interface CMOutput {
  name: string;
  columnName: string;
  type: string;
  round: number;
  prompt: string;
  [key: string]: any;
}

export interface WorkspaceState {
  pdfUrl?: string;
  precalculatedRows?: string[];
  inheritedProject?: any;
}

const PROMPT_SCRIPT = (i: number | string) => `Genera il testo parlato per la PARTE ${i} di una video lezione di formazione professionale.

ARGOMENTO DELLA LEZIONE:
##argomento##

STRUTTURA COMPLETA DELLA LEZIONE:
##$struttura_lezione##

Genera il testo parlato SOLO per la parte ${i} (riga ${i} della struttura).

INDICAZIONI DELL'UTENTE:
##indicazioni_utente##

DOCUMENTO FONTE (testo estratto da PDF via OCR — usa come fonte dati esclusiva):
##documento_pdf##

APERTURA:
${i === 1 || i === "1" ? `le prime righe devono essere ESATTAMENTE il testo di apertura fornito:

"##apertura##, Lezione numero ##numero_lezione##"

Dopo l'apertura, prosegui con il contenuto.` : `- inizia con un breve RACCORDO poi prosegui con il contenuto`}

VINCOLI OBBLIGATORI:
- Lunghezza tra 300 e 400 parole (circa 2-3 minuti di parlato)
- Solo testo parlato del docente, niente altro
- Non usare virgolette doppie, backslash, markup, tag, parentesi quadre o asterischi
- Usa ESCLUSIVAMENTE dati presenti nel documento fonte. NON inventare, stimare o dedurre numeri non presenti nel documento. Se un dato non esiste nella fonte, non citarlo.
- Contestualizza ogni dato: spiega cosa significa in termini pratici per il pubblico
- NON ripetere concetti già trattati in parti precedenti della struttura

LINGUAGGIO — REGOLA CRITICA:
Il video finale è un UNICO FLUSSO CONTINUO, non è diviso in scene o parti visibili allo spettatore. NON usare MAI le parole "scena", "parte", "sezione", "segmento", "capitolo" per riferirti alla struttura del video. Usa invece transizioni naturali del parlato come:
- "ora vediamo", "passiamo a", "concentriamoci su"
- "un altro aspetto importante è", "parliamo ora di"
- "approfondiamo", "analizziamo", "guardiamo insieme"
- "come abbiamo visto", "a questo punto"

NOTA AVATAR:
##nota_avatar##

Output: solo il testo parlato, nient'altro.`;

const PROMPT_DATI = (i: number | string) => `Estrai i contenuti chiave per creare una slide infografica relativa alla PARTE ${i} di una video lezione.

STRUTTURA LEZIONE:
##$struttura_lezione##

La parte ${i} corrisponde alla riga ${i} della struttura.

DOCUMENTO FONTE (testo estratto da PDF via OCR — fonte esclusiva):
##documento_pdf##

ISTRUZIONI:
Analizza il contenuto della parte ${i} e scegli il formato più adatto tra i due seguenti.

═══ FORMATO A: DATI NUMERICI ═══
Usa questo formato se il tema ha dati quantitativi rilevanti (percentuali, valori, confronti numerici):

TITOLO: [max 6 parole]
SOTTOTITOLO: [opzionale, contesto aggiuntivo max 8 parole]
TIPO: dati
DATO_1: [etichetta breve max 4 parole] = [valore numerico con unità]
DATO_2: [etichetta breve max 4 parole] = [valore numerico con unità]
...fino a DATO_5 (minimo 2, massimo 5)
ICONA: [suggerimento icona, es: grafico a barre, globo, hotel]

═══ FORMATO B: CONCETTI ═══
Usa questo formato se il tema è prevalentemente qualitativo, strategico o teorico (senza numeri significativi):

TITOLO: [max 6 parole]
SOTTOTITOLO: [opzionale, contesto aggiuntivo max 8 parole]
TIPO: concetti
PUNTO_1: [concetto chiave, max 8 parole]
PUNTO_2: [concetto chiave, max 8 parole]
...fino a PUNTO_5 (minimo 2, massimo 5)
LAYOUT: [lista, mappa mentale, flusso, confronto, ciclo]
ICONA: [suggerimento icona]

REGOLE:
- Scegli FORMATO A se ci sono almeno 2 dati numerici significativi nel documento per questa parte
- Scegli FORMATO B se il contenuto è prevalentemente qualitativo o concettuale
- Solo contenuti PRESENTI nel documento, non inventare
- Usa meno elementi (2-3) se il tema è semplice, più (4-5) se è ricco
- Un solo formato per slide, non mischiarli`;

const PROMPT_SLIDE = (i: number | string) => `Crea una slide professionale per un video corso di formazione. L'immagine DEVE essere in formato 16:9 widescreen (1280x720).

ISTRUZIONI DI LAYOUT: occupa lo spazio in modo elegante e non accalcato
CONTENUTO DA VISUALIZZARE:

##$dati_slide_${i}##

ISTRUZIONI GRAFICHE:
- Leggi il campo TIPO per decidere lo stile:
  - Se TIPO è "dati": visualizza come infografica numerica con numeri grandi, barre, indicatori, icone
  - Se TIPO è "concetti": visualizza come infografica concettuale con keyword evidenziate, frecce, flussi, icone tematiche. Se c'è un campo LAYOUT, usalo come guida (lista, mappa mentale, flusso, confronto, ciclo)
- Il TITOLO va in alto nella zona destra, in grassetto
- Se presente SOTTOTITOLO, posizionalo sotto il titolo in carattere più piccolo
- Usa lo stile grafico di image reference 1
- Background zona slide: BIANCO
- Palette colori base da immagine di riferimento 1 ma puoi ampliare se utile
- Stile pulito, minimale, professionale
- NON inserire testo placeholder o Lorem Ipsum
- Testi e numeri devono essere BEN LEGGIBILI e grandi
- Adatta il layout al numero di elementi: più spazio se 2-3, più compatto se 4-5`;

function bf(overrides: any = {}) {
  return {
    translate: false,
    finalField: true,
    observability: false,
    referenceImages: [],
    editReferenceImages: false,
    imageProvider: "openai",
    imageOptions: { size: "auto", quality: "auto", moderation: "auto" },
    geminiOptions: { thinkingLevel: "auto", imageSize: "auto", aspectRatio: "auto" },
    videoOptions: { quality: "auto", aspectRatio: "auto" },
    referenceVideos: [],
    videoReferenceMode: "text-to-video",
    videoReferenceConfig: { startFrameField: "", endFrameField: "", styleReferenceFields: [], sourceVideoField: "" },
    ...overrides
  };
}

const getPreviewTemplate = (maxScenes: number) => {
  let html = `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>Lezione</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#f5f5f5;color:#111}.h{padding:24px 32px;background:#fff;border-bottom:2px solid #eee}.h h1{font-size:22px;font-weight:700;color:#111}.h p{color:#666;font-size:13px;margin-top:4px}
/* === COPERTINA === */
.cover{margin:24px 32px 8px;padding:32px 40px;background:#fff;border-radius:14px;border:1px solid #e0e0e0;box-shadow:0 1px 4px rgba(0,0,0,0.06);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:20px}.cover-img{width:100%;max-width:720px;border-radius:10px;border:1px solid #ddd;display:block;margin:0 auto}.cover-title{font-size:26px;font-weight:800;color:#111;line-height:1.3;max-width:680px}
.sc{margin:16px 32px;padding:18px;background:#fff;border-radius:14px;border:1px solid #e0e0e0;box-shadow:0 1px 4px rgba(0,0,0,0.06)}.sh{display:flex;align-items:center;gap:8px;margin-bottom:14px}.sn{background:#f90;color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px}.sh b{font-size:15px;color:#222}.mr{display:flex;gap:20px;align-items:flex-start}.left-col{width:42%;flex-shrink:0}.left-col img{width:100%;border-radius:8px;border:1px solid #ddd;display:block}.left-col audio{width:100%;height:32px;margin-top:8px}.slide-data{font-size:12px;line-height:1.6;color:#555;margin-top:8px;padding:8px 10px;background:#f9f9f9;border-left:3px solid #f90;border-radius:4px}.right-col{flex:1;padding-left:8px}.right-col p{font-size:14px;line-height:1.7;color:#333}</style></head><body>
<div class="h"><h3>##argomento##</h3><h3>Lezione ##numero_lezione##</h3></div>
<div class="cover">
  <img class="cover-img" src="##$copertina##" alt="Copertina del corso" />
  <div class="cover-title">##titolo_corso##</div>
</div>\n`;

  for (let i = 1; i <= maxScenes; i++) {
    html += `<div class="sc"><div class="sh"><div class="sn">${i}</div><b>Scena ${i}</b></div><div class="mr"><div class="left-col"><img src="##$slide_scena_${i}##" /><audio controls src="##$audio_scena_${i}##"></audio><div class="slide-data">##$dati_slide_${i}##</div></div><div class="right-col"><p>##$script_scena_${i}##</p></div></div></div>\n`;
  }

  html += `</body></html>`;
  return html;
};

export function generateContentMachineJson(config: ProjectBuilderConfig) {
  const { projectName, numRows, maxScenes, inheritedProject } = config;

  const skills: any[] = [];

  const inputs: any[] = [
    {
      tagName: "##argomento##", columnName: "argomento", type: "text",
      description: "Argomento principale macro", pre_prompt: null, translate: false, test: null, order: 0
    },
    {
      tagName: "##apertura##", columnName: "apertura", type: "text",
      description: "Apertura lezione 1", pre_prompt: null, translate: false, test: null, order: 1
    },
    {
      tagName: "##nota_avatar##", columnName: "nota_avatar", type: "text",
      description: "Note interpretazione avatar", pre_prompt: null, translate: false, test: null, order: 2
    },
    {
      tagName: "##numero_lezione##", columnName: "numero_lezione", type: "text",
      description: "Numero Lezione", pre_prompt: null, translate: false, test: null, order: 3
    },
    {
      tagName: "##piano_corso##", columnName: "piano_corso", type: "text",
      description: "Piano globale del corso in pillole", pre_prompt: null, translate: false, test: null, order: 4
    },
    {
      tagName: "##indicazioni_utente##", columnName: "indicazioni_utente", type: "text",
      description: "Possibili note e indicazioni aggiunte", pre_prompt: null, translate: false, test: null, order: 5
    },
    {
      tagName: "##numero_scene##", columnName: "numero_scene", type: "text",
      description: "Numero totale scene", pre_prompt: null, translate: false, test: null, order: 6
    },
    {
      tagName: "##documento_pdf##", columnName: "documento_pdf", type: "pdf",
      description: "Il Documento OCR PDF", pre_prompt: null, translate: false, test: null, order: 7
    },
    {
      tagName: "##titolo_corso##", columnName: "titolo_corso", type: "text",
      description: "titolo del corso", pre_prompt: null, translate: false, test: null, order: 8
    }
  ];

  const outputs: CMOutput[] = [];
  function addOutput(out: CMOutput) { outputs.push(out); }

  const STRUTTURA_PROMPT = `Crea esattamente ##numero_scene## parti per una video lezione professionale.

Contesto Macro: ##argomento##

Il testo della lezione \n DOCUMENTO OCR: ##documento_pdf##

Ogni parte deve coprire un sotto-argomento specifico e distinto.
La prima parte deve essere un'introduzione generale della lezione.
Le parti devono essere collegate in ordine di flusso logico, pronte a diventare uno script di parlato.
Manda in Output RISPONDI SOLO CON L'ELENCO PUNTATO.`;

  let orderCounter = 0;

  addOutput({
    prompt: `Crea una slide di apertura professionale per un video corso di formazione. L'immagine DEVE essere in formato 16:9 widescreen (1280x720).\n\nISTRUZIONI DI LAYOUT: occupa lo spazio in modo elegante, arioso e non accalcato. È la prima slide del corso, deve trasmettere autorevolezza e chiarezza.\n\nTITOLO DA VISUALIZZARE:\n\n##titolo_corso##\nLezione: ##numero_lezione##\n\nSIMBOLO DA VISUALIZZARE:\n\nimmagina un singolo simbolo che rappresenti il seguente concetto:\n\n##argomento##\n\nISTRUZIONI GRAFICHE:\n\nQuesta è una slide di APERTURA DEL CORSO, non una slide di contenuto. Lo stile deve essere da copertina: impatto visivo forte, gerarchia tipografica chiara\n\n- Il TITOLO CORSO va al centro o nella zona sinistra, grande, in grassetto, su 1-2 righe massimo\n- Usa lo stile grafico di image reference 1\n- Background: BIANCO \n- Palette colori base da immagine di riferimento 1 ma puoi ampliare se utile\n- Stile pulito, minimale, professionale, da copertina editoriale\n- NON inserire testo placeholder o Lorem Ipsum\n- Testi devono essere BEN LEGGIBILI, grandi e ben spaziati\n- Gerarchia visiva netta: titolo > numero lezione > simbolo`,
    note: "Copertina", order: orderCounter++, 
    ...bf({
      referenceImages: ["##slide_style##"],
      editReferenceImages: true,
      imageProvider: "gemini",
      geminiOptions: { imageSize: "1024", thinkingLevel: "auto", aspectRatio: "16:9" }
    })
  });

  addOutput({
    name: "struttura_lezione", columnName: "struttura_lezione", type: "text", round: 1,
    prompt: STRUTTURA_PROMPT, note: "Generazione Struttura Parti", order: orderCounter++, ...bf({ finalField: false })
  });

  const part1_end = maxScenes;

  // Round 2: scripts and dati slide
  for (let i = 1; i <= part1_end; i++) {
    addOutput({
      name: `script_scena_${i}`, columnName: `script_scena_${i}`, type: "text", round: 2,
      prompt: PROMPT_SCRIPT(i), note: `Script ${i}`, order: orderCounter++, ...bf()
    });
    addOutput({
      name: `dati_slide_${i}`, columnName: `dati_slide_${i}`, type: "text", round: 2,
      prompt: PROMPT_DATI(i), note: `Dati Slide ${i}`, order: orderCounter++, ...bf({ finalField: false })
    });
  }

  const round_start = 3;

  for (let s_idx = 1; s_idx <= part1_end; s_idx++) {
    addOutput({
      name: `slide_scena_${s_idx}`, columnName: `slide_scena_${s_idx}`, type: "genimage", round: round_start,
      prompt: PROMPT_SLIDE(s_idx), note: `Slide Infografica ${s_idx}`, order: orderCounter++,
      ...bf({
        referenceImages: ["##slide_style##"],
        editReferenceImages: true,
        imageProvider: "gemini",
        geminiOptions: { imageSize: "1024", thinkingLevel: "auto", aspectRatio: "16:9" },
        imageOptions: { size: "auto", quality: "auto", moderation: "auto" }
      })
    });

    addOutput({
      name: `audio_scena_${s_idx}`, columnName: `audio_scena_${s_idx}`, type: "voice", round: round_start,
      prompt: `##$script_scena_${s_idx}##`, note: `Audio ${s_idx}`, order: orderCounter++,
      ...bf({
        imageProvider: "openai",
        geminiOptions: { thinkingLevel: "auto", imageSize: "auto", aspectRatio: "auto", voice: "it-IT-Studio-C" }
      })
    });
  }

  // Pre-seed the mapped dataset with empty strings for all outputs
  const mappings: Record<string, string> = {
    "argomento": "", "apertura": "", "nota_avatar": "",
    "numero_lezione": "", "piano_corso": "", "indicazioni_utente": "",
    "numero_scene": maxScenes.toString(), "documento_pdf": ""
  };
  
  outputs.forEach(out => {
    mappings[out.columnName] = "";
  });

  const inheritedData = config.inheritedDatasetRow || inheritedProject?.dataset?.[0]?.data?.it || {};
  
  const datasetRows = [];
  for (let r = 0; r < numRows; r++) {
    const finalData: any = { status: "pending", ...mappings };
    
    // Inherit inputs from the pianificatore row if present (matching by name)
    inputs.forEach(inp => {
      // If the pianificatore produced a field with the exact same name or it was injected, inherit it
      if (inheritedData[inp.columnName] !== undefined) {
        finalData[inp.columnName] = inheritedData[inp.columnName];
      }
    });
    
    // For legacy support: if nota_avatar doesn't map correctly, copy it manually from assets or row
    if (!finalData.nota_avatar && inheritedProject?.assets) {
      const avatarAsset = inheritedProject.assets.find((a: any) => a.tagName === '##nota_avatar##');
      if (avatarAsset && avatarAsset.value) {
        finalData.nota_avatar = avatarAsset.value;
      }
    }

    // Compute specific row overrides based on parsed UI state
    finalData.argomento = config.precalculatedRows?.[r] || finalData.argomento || "";
    finalData.numero_lezione = (r + 1).toString();
    finalData.numero_scene = maxScenes.toString();
    finalData.indicazioni_utente = config.contextPrompt || finalData.indicazioni_utente || "";
    if (config.pdfUrl) {
      finalData.documento_pdf = config.pdfUrl;
    }

    datasetRows.push({ 
      data: { "it": finalData },
      order: r
    });
  }

  // Build the final properly formatted ProjectExportData schema
  return {
    project: {
      ...(inheritedProject?.project || {}),
      name: projectName || inheritedProject?.project?.name || "Corso Video Builder",
      endpoint: inheritedProject?.project?.endpoint || "https://platform-ai-dev.ws-deploy-01.wslabs.it/api/llm/message?locale=it&raw&logThread=false",
      appkey: inheritedProject?.project?.appkey || "app-w.academy",
      apikey: inheritedProject?.project?.apikey || "",
      openaiApikey: inheritedProject?.project?.openaiApikey || "",
      geminiApikey: inheritedProject?.project?.geminiApikey || "",
      previewTemplateContent: getPreviewTemplate(maxScenes),
      createdAt: inheritedProject?.project?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    languages: [
      {
        code: "it",
        name: "Italiano",
        prompt: null,
        isOrigin: true,
        createdAt: new Date().toISOString()
      }
    ],
    extractions: [],
    inputs: inputs,
    outputs: outputs,
    columnMappings: [...inputs, ...outputs].map((f: any) => ({ columnName: f.columnName, inputFieldId: null })),
    skills: skills,
    assets: inheritedProject?.assets || [],
    dataset: datasetRows,
    exportedAt: new Date().toISOString(),
    version: "2.0.0"
  };
}

export function buildTemplateHtml(config: ProjectBuilderConfig) {
  const { maxScenes } = config;
  let html = `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>Preview Video Lezione</title>
</head>
<body style="font-family: sans-serif; background: #f0f0f0; margin: 0; padding: 20px;">`;

  for (let i = 1; i <= maxScenes; i++) {
    html += `<div style="margin-bottom: 40px; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
      <h2>Scena ${i}</h2>
      <div style="display:flex; gap: 20px; flex-wrap: wrap;">
        <div style="flex:1; min-width: 300px;">
          <h3>Script:</h3>
          <p>##$script_scena_${i}##</p>
          <hr/>
          <h3>Audio:</h3>
          <audio controls src="##$audio_scena_${i}##"></audio>
        </div>
        <div style="flex:1; min-width: 300px;">
          <h3>Slide 16:9:</h3>
          <img src="##$slide_scena_${i}##" alt="Slide ${i}" style="width:100%; height:auto; aspect-ratio: 16/9; object-fit: cover; border: 1px solid #ccc;"/>
        </div>
      </div>
    </div>`;
  }

  html += `</body></html>`;
  return html;
}
