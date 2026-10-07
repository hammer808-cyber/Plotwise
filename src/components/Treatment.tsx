import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, ArrowRight, Droplets, Sun, Thermometer, Scissors, Info, CheckCircle, ShieldCheck, Wind, HeartPulse, AlertTriangle, Bug, FlaskConical, History, XCircle, Plus, ClipboardList, Beaker, ListChecks, Leaf, Flower2, ExternalLink, Camera, Check } from 'lucide-react';
import { useFirebase } from '../contexts/FirebaseContext';
import { recalculateVigor } from '../lib/vigor';
import { useActivePlot } from '../contexts/ActivePlotContext';
import { db, collection, query, where, onSnapshot, handleFirestoreError, OperationType, updateDoc, doc, addDoc, serverTimestamp, deleteDoc } from '../firebase';
import { GoogleGenAI } from "@google/genai";
import { cn } from '@/src/lib/utils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Inhabitant, EventLog } from '../types';
import { checkTreatmentConflict } from '../services/botanyService';
import { logEvent } from '../services/eventService';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';
import TreatmentConflictModal from './TreatmentConflictModal';
import DiagnosisPanel, { DiagnosisCandidate, DiagnosisResult } from './DiagnosisPanel';
import CorrectionReviewList from './CorrectionReviewList';

const DISEASE_DATABASE = [
  {
    id: "powdery-mildew",
    name: "Powdery Mildew",
    description: "A fungal disease that results in a white, powdery coating on leaves.",
    plants: ["Zucchini", "Cucumber", "Roses", "Squash"],
    steps: ["Prune infected leaves", "Improve air circulation", "Apply milk/water spray (40/60 ratio)"],
    materials: ["Pruning shears", "Spray bottle", "Milk", "Water"],
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuBh8-Xz-hcf43otToJeH0Y00oShBanv4cHeJOmJSiWv1V37MC3lLo3vHtcQ0rRdiJQpBkxnqk3ddeMd57_1eR2aYgDBg2YduhxREvkFVeWcmEv8XFmZ4Y4LsYXdBOIp0P8lP3zrDweSep7Glo9n1PQdxsksBlA6yN3a9fxL1KkJ3gLHh5iMSupr1DsMjRLh_oOVIje1Y6lXn3zhnTNX9MHjNeqzJVQG2YH1POC0UDIU-a5MQoF_uX24rkaenUKRRAsvMtnx5lmycb6B"
  },
  {
    id: "aphids",
    name: "Aphids",
    description: "Small, soft-bodied insects that suck sap from new growth.",
    plants: ["Most plants", "Roses", "Peppers", "Kale"],
    steps: ["Blast with strong water stream", "Apply neem oil", "Introduce ladybugs"],
    materials: ["Garden hose", "Neem oil", "Ladybugs"],
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuBr5dRPjQUqy0FhqsUqh208LrOIjQxDyYi4RRe9TD5PfUADV5ISuqweqDF0b3-tdqPhhtm0F2Iq0ZjLpWx39OoCi7u2SVKV7_eyZHGXLdhaPu9qY4PGeyAEGYITeVHsMj_0XPoCdem6SO2qU7cE99U1xpWZnfLZKF3hn-_X79yYNG89eOcyNFmVHECp5vLWULGcN09cGYPzVAj8w5lU8oxMRa2WbZ6OyIOmoCw48GccdQdJuYwxlTm5GGk3UvgLMKh6Y7EWpN_wndRr"
  },
  {
    id: "spider-mites",
    name: "Spider Mites",
    description: "Tiny arachnids that cause yellow stippling and fine webbing.",
    plants: ["Tomatoes", "Beans", "Houseplants", "Cucumbers"],
    steps: ["Increase humidity", "Spray with insecticidal soap", "Remove heavily infested leaves"],
    materials: ["Mister", "Insecticidal soap", "Pruning shears"],
    image: "https://images.unsplash.com/photo-1591857177580-dc82b9ac4e1e?auto=format&fit=crop&q=80&w=800"
  },
  {
    id: "late-blight",
    name: "Late Blight",
    description: "A devastating disease causing dark, water-soaked spots on leaves and fruit.",
    plants: ["Tomatoes", "Potatoes"],
    steps: ["Remove and destroy infected plants", "Avoid overhead watering", "Apply copper fungicide"],
    materials: ["Disposal bags", "Copper fungicide", "Drip irrigation"],
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuD5LMlgzBUqYwF1gKz5QhylS1U-tA9YsT1W-_N0esBzk_znZlGXFR-fGHqC1GvgwBg7BD0wDNhtJujl1p0FAzlQTcW8goE8cZ2u0U-cOD2YQIHwOStUlcfX_AmmiVLz2MILMtGWjUUmrpc7je_Yyc29uf9kCxVsTxsYC99n5wl-_zjp3GNHfn4N3sEPUMZQRXYqrShURV-fegj66O5yYI6y1r2q0VXiRNKlqXU6QGb_t26yGO2ejirslqJx9wr23Ag2Zvk24-Zv9QSd"
  },
  {
    id: "rust-fungus",
    name: "Rust Fungus",
    description: "Orange or brown powdery pustules on the undersides of leaves.",
    plants: ["Beans", "Roses", "Garlic", "Onions"],
    steps: ["Remove infected leaves", "Avoid wetting foliage", "Apply sulfur-based fungicide"],
    materials: ["Sulfur fungicide", "Gloves", "Pruning shears"],
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuDPDAtO_MUyrs_o2PCRWE3PyObQl2WtTFR53MC3Wivzfn_mEhGx8UhPjmtgUtnp4z7IrDKRjQrCL8Oe49Bgin4zp5OvjxMxW81oT2DyilVoF__pU93X4q9fJ4hxvIk7q_aW47YPISryadtoJaLi8tZ4fvb5vj__gdDtTfN2JkkkJdJA9nhwZp9i2gL6ZZGQBz2R8Ng6t7eufYJPgkUj4QSjan0qdx2GfUk455ClgYGKhxR3g09K-CLSzuDCy-CVb32RxizwdS03a9TX"
  },
  {
    id: "root-rot",
    name: "Root Rot",
    description: "Decay of roots due to overwatering and poor drainage.",
    plants: ["Any plant", "Succulents", "Houseplants"],
    steps: ["Stop watering immediately", "Repot in fresh, dry soil", "Trim mushy roots"],
    materials: ["Fresh potting mix", "New pot (optional)", "Sterilized scissors"],
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuB3lzXmntdoBOpuh_yRgaf3ZMV66eYMAV3GWmTub7cMrV9rtZOIYU4TDYWHuQHebfOHiawan5Lq5wgzPSnslQjD6VuZ8NJw7JzfgJl_9MgBt2TRFWAy8cI_fcCE0BqZ73NhyAbGSk8t2EDo8wxPsUszDQffO5ywah_81A_SBM6-FTMCEwk_rk_aLBjp0b2dkuhYVDs4Q7A5-lW6eGo2yUY7p5W7AAAgncBezDTkrZEeahpk0I13T_oWqXkO4JQq4sY60DnnwkPutTtZ"
  },
  {
    id: "cabbage-worms",
    name: "Cabbage Worms",
    description: "Green caterpillars that eat large holes in brassica leaves.",
    plants: ["Kale", "Broccoli", "Cabbage", "Brussels Sprouts"],
    steps: ["Hand-pick worms", "Apply Bt (Bacillus thuringiensis)", "Use row covers"],
    materials: ["Bt spray", "Floating row covers", "Gloves"],
    image: "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&q=80&w=800"
  },
  {
    id: "tomato-hornworm",
    name: "Tomato Hornworm",
    description: "Large green caterpillars that can defoliate a plant overnight.",
    plants: ["Tomatoes", "Peppers", "Eggplant"],
    steps: ["Hand-pick at dusk (use UV light)", "Encourage parasitic wasps", "Till soil in winter"],
    materials: ["UV flashlight", "Gloves", "Tiller"],
    image: "https://images.unsplash.com/photo-1592150621344-224218e0da99?auto=format&fit=crop&q=80&w=800"
  },
  {
    id: "japanese-beetles",
    name: "Japanese Beetles",
    description: "Metallic green beetles that skeletonize leaves.",
    plants: ["Roses", "Grapes", "Beans", "Raspberries"],
    steps: ["Hand-pick into soapy water", "Apply milky spore to lawn", "Use neem oil"],
    materials: ["Bucket of soapy water", "Milky spore", "Neem oil"],
    image: "https://images.unsplash.com/photo-1515150144380-bca9f1650ed9?auto=format&fit=crop&q=80&w=800"
  },
  {
    id: "scale-insects",
    name: "Scale Insects",
    description: "Small, stationary bumps on stems and leaves that suck sap.",
    plants: ["Citrus", "Houseplants", "Fruit trees"],
    steps: ["Scrape off gently", "Apply horticultural oil", "Prune heavily infested stems"],
    materials: ["Soft brush", "Horticultural oil", "Pruning shears"],
    image: "https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&q=80&w=800"
  },
  {
    id: "mealybugs",
    name: "Mealybugs",
    description: "White, cottony insects found in leaf axils and crevices.",
    plants: ["Houseplants", "Succulents", "Coleus"],
    steps: ["Dab with rubbing alcohol", "Spray with insecticidal soap", "Isolate plant"],
    materials: ["Cotton swabs", "Rubbing alcohol", "Insecticidal soap"],
    image: "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&q=80&w=800"
  },
  {
    id: "whiteflies",
    name: "Whiteflies",
    description: "Tiny white moth-like insects that fly up when disturbed.",
    plants: ["Tomatoes", "Peppers", "Fuchsia", "Hibiscus"],
    steps: ["Use yellow sticky traps", "Apply neem oil", "Vacuum adults in early morning"],
    materials: ["Yellow sticky traps", "Neem oil", "Handheld vacuum"],
    image: "https://images.unsplash.com/photo-1591857177580-dc82b9ac4e1e?auto=format&fit=crop&q=80&w=800"
  },
  {
    id: "slugs-snails",
    name: "Slugs & Snails",
    description: "Slimy mollusks that eat holes in leaves and fruit at night.",
    plants: ["Hostas", "Lettuce", "Strawberries", "Marigolds"],
    steps: ["Set beer traps", "Apply iron phosphate bait", "Create copper barriers"],
    materials: ["Shallow dish & beer", "Iron phosphate pellets", "Copper tape"],
    image: "https://images.unsplash.com/photo-1515150144380-bca9f1650ed9?auto=format&fit=crop&q=80&w=800"
  },
  {
    id: "leaf-spot",
    name: "Leaf Spot",
    description: "Small brown or black spots often surrounded by a yellow halo.",
    plants: ["Beets", "Chard", "Tomatoes", "Spinach"],
    steps: ["Remove infected leaves", "Avoid overhead watering", "Rotate crops annually"],
    materials: ["Pruning shears", "Mulch", "Garden planner"],
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuD5LMlgzBUqYwF1gKz5QhylS1U-tA9YsT1W-_N0esBzk_znZlGXFR-fGHqC1GvgwBg7BD0wDNhtJujl1p0FAzlQTcW8goE8cZ2u0U-cOD2YQIHwOStUlcfX_AmmiVLz2MILMtGWjUUmrpc7je_Yyc29uf9kCxVsTxsYC99n5wl-_zjp3GNHfn4N3sEPUMZQRXYqrShURV-fegj66O5yYI6y1r2q0VXiRNKlqXU6QGb_t26yGO2ejirslqJx9wr23Ag2Zvk24-Zv9QSd"
  },
  {
    id: "downy-mildew",
    name: "Downy Mildew",
    description: "Yellow patches on top of leaves with fuzzy growth underneath.",
    plants: ["Grapes", "Lettuce", "Basil", "Cucumbers"],
    steps: ["Improve air circulation", "Apply copper fungicide", "Plant resistant varieties"],
    materials: ["Copper fungicide", "Stakes/Trellis", "Resistant seeds"],
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuBh8-Xz-hcf43otToJeH0Y00oShBanv4cHeJOmJSiWv1V37MC3lLo3vHtcQ0rRdiJQpBkxnqk3ddeMd57_1eR2aYgDBg2YduhxREvkFVeWcmEv8XFmZ4Y4LsYXdBOIp0P8lP3zrDweSep7Glo9n1PQdxsksBlA6yN3a9fxL1KkJ3gLHh5iMSupr1DsMjRLh_oOVIje1Y6lXn3zhnTNX9MHjNeqzJVQG2YH1POC0UDIU-a5MQoF_uX24rkaenUKRRAsvMtnx5lmycb6B"
  }
];

const SARCASTIC_COMMENTS = [
  "Oh look, another plant you're trying to kill. Let's see if we can stop the inevitable.",
  "Your garden is basically a buffet for pests at this point. Bon appétit!",
  "Is it a disease or just your lack of attention? Hard to tell sometimes.",
  "Congratulations on creating a thriving ecosystem for everything EXCEPT your plants.",
  "Maybe if you talked to them more? Or just, you know, watered them correctly.",
  "I've seen healthier plants in a compost bin, but let's try to fix this mess."
];

export default function Treatment() {
  const { user } = useFirebase();
  const { activePlotId, activePlot } = useActivePlot();
  const navigate = useNavigate();
  const [sickPlants, setSickPlants] = useState<Inhabitant[]>([]);
  const [allPlants, setAllPlants] = useState<Inhabitant[]>([]);
  const [selectedPlant, setSelectedPlant] = useState<Inhabitant | null>(null);
  const [treatmentLogs, setTreatmentLogs] = useState<any[]>([]);
  const [eventLogs, setEventLogs] = useState<EventLog[]>([]);
  const [isLogFormOpen, setIsLogFormOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [dailyComment] = useState(() => SARCASTIC_COMMENTS[Math.floor(Math.random() * SARCASTIC_COMMENTS.length)]);

  // Form State
  const [formPlantId, setFormPlantId] = useState('');
  const [formDiseaseId, setFormDiseaseId] = useState('');
  const [formSymptoms, setFormSymptoms] = useState('');
  const [formSuccessRate, setFormSuccessRate] = useState('100');
  const [formManualDisease, setFormManualDisease] = useState('');
  const [formManualTreatment, setFormManualTreatment] = useState('');
  const [formImage, setFormImage] = useState<string | null>(null);
  const [formImagePreview, setFormImagePreview] = useState<string | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosisResult, setDiagnosisResult] = useState<any>(null);
  const [conflictModalData, setConflictModalData] = useState<{ isOpen: boolean; message: string; action: string; conflictingAction: string; conflictingDate: string } | null>(null);
  const [editingSuccessRateId, setEditingSuccessRateId] = useState<string | null>(null);
  const [editSuccessRateValue, setEditSuccessRateValue] = useState('');

  // Active-plot scope: everything on this page follows the global active plot.
  const visibleAllPlants = React.useMemo(
    () => allPlants.filter(p => !activePlotId || p.plotId === activePlotId),
    [allPlants, activePlotId]
  );
  const visibleSickPlants = React.useMemo(
    () => sickPlants.filter(p => !activePlotId || p.plotId === activePlotId),
    [sickPlants, activePlotId]
  );
  const visibleTreatmentLogs = React.useMemo(() => {
    const ids = new Set(visibleAllPlants.map(p => p.id));
    return treatmentLogs.filter(l => !l.plantId || ids.has(l.plantId));
  }, [treatmentLogs, visibleAllPlants]);

  useEffect(() => {
    if (!user) return;

    // Fetch sick plants
    const sickQ = query(collection(db, 'inhabitants'), where('ownerUid', '==', user.uid), where('status', '==', 'Struggling'));
    const unsubscribeSick = onSnapshot(sickQ, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Inhabitant));
      setSickPlants(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'inhabitants');
    });

    // Fetch all plants for the form
    const allQ = query(collection(db, 'inhabitants'), where('ownerUid', '==', user.uid));
    const unsubscribeAll = onSnapshot(allQ, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Inhabitant));
      setAllPlants(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'inhabitants');
    });

    // Fetch all event logs for conflict checking
    const logsQ = query(collection(db, 'event_logs'), where('ownerUid', '==', user.uid));
    const unsubscribeLogs = onSnapshot(logsQ, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EventLog));
      setEventLogs(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'event_logs');
    });

    // Fetch treatment logs (legacy or specific treatments collection)
    const tLogsQ = query(collection(db, 'treatments'), where('ownerUid', '==', user.uid));
    const unsubscribeTLogs = onSnapshot(tLogsQ, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTreatmentLogs(list.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'treatments');
    });

    return () => {
      unsubscribeSick();
      unsubscribeAll();
      unsubscribeLogs();
      unsubscribeTLogs();
    };
  }, [user]);

  const handleResolve = async (id: string) => {
    const rate = prompt("How successful was this treatment? (0-100%)", "100");
    if (rate === null) return;

    try {
      // Find the active treatment for this plant
      const activeLog = treatmentLogs.find(l => l.plantId === id && l.status === 'Active');
      if (activeLog) {
        await updateDoc(doc(db, 'treatments', activeLog.id), {
          status: 'Resolved',
          successRate: parseInt(rate) || 100,
          resolvedAt: serverTimestamp()
        });
      }

      await updateDoc(doc(db, 'inhabitants', id), {
        status: 'Healthy',
        needsWater: false
      });
      const resolvedTreatments = treatmentLogs.map(l => l.id === (activeLog && activeLog.id) ? { ...l, status: 'Resolved', successRate: parseInt(rate) || 100, resolvedAt: new Date() } : l);
      const resolvedPlant = sickPlants.find(p => p.id === id) || visibleAllPlants.find(p => p.id === id);
      if (resolvedPlant) {
        recalculateVigor({ ...resolvedPlant, status: 'Healthy', needsWater: false } as any, undefined, resolvedTreatments as any).catch(() => {});
      }

      // Create calendar event for resolution
      const plant = sickPlants.find(p => p.id === id);
      await addDoc(collection(db, 'calendar_events'), {
        ownerUid: user.uid,
        title: `Resolved: ${plant?.name || 'Plant'} recovered`,
        description: `Treatment successful (${rate}%). Plant status returned to Healthy.`,
        date: new Date().toISOString(),
        type: 'Treatment',
        priority: 'Medium',
        relatedId: id,
        createdAt: serverTimestamp()
      });

      setSelectedPlant(null);
      toast.success("Plant marked as recovered!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `plants/${id}`);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormImagePreview(reader.result as string);
        // Extract base64 data for Gemini
        const base64Data = (reader.result as string).split(',')[1];
        setFormImage(base64Data);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAIDiagnosis = async (extraContext?: string) => {
    if (!formSymptoms || !formPlantId) {
      toast.error("Please select a plant and describe symptoms first.");
      return;
    }
    setIsDiagnosing(true);
    setDiagnosisResult(null);
    setFormDiseaseId('');

    const plant = allPlants.find(p => p.id === formPlantId);

    const parseCandidates = (text: string): { id: string; confidence: number; cues: string[] }[] | null => {
      try {
        const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        const parsed = JSON.parse(cleaned);
        if (!parsed || !Array.isArray(parsed.candidates)) return null;
        return parsed.candidates;
      } catch {
        return null;
      }
    };

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

      const parts: any[] = [
        { text: `As a botanical expert with 30 years of experience, rank the most likely plant diseases or pests from the list below based on these symptoms: "${formSymptoms}".
        The plant is a ${plant?.name} (${plant?.type}).
        ${extraContext ? `Additional context from the gardener (treat as authoritative): "${extraContext}".\n` : ''}
        Available diseases in our database: ${DISEASE_DATABASE.map(d => `${d.id} (${d.name})`).join(', ')}.

        Consider the specific plant type and how these symptoms manifest in it.
        If an image is provided, use it as the primary source of truth.

        Return ONLY valid JSON, no code fences, shaped exactly like this:
        {"candidates":[{"id":"<disease-id>","confidence":72,"cues":["short plain-language observation","another observation"]},{"id":"<disease-id>","confidence":21,"cues":["..."]}],"notes":"optional one-line caveat"}

        Rules: up to 3 candidates, best first; confidence is 0-100 per candidate and should roughly sum to 100; cues are 2-3 short plain-language observations from the symptoms${formImage ? ' or image' : ''} that support that candidate (what you noticed); every id must come from the list above; if nothing in the list fits, return {"candidates":[]}.` }
      ];

      if (formImage) {
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: formImage
          }
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts },
      });

      const raw = response.text?.trim() || '';
      const parsed = parseCandidates(raw);

      const buildResult = (items: { id: string; confidence: number; cues: string[] }[], notes?: string): DiagnosisResult | null => {
        const mapped: DiagnosisCandidate[] = items
          .map(item => {
            const disease = DISEASE_DATABASE.find(d => d.id === String(item.id).toLowerCase());
            if (!disease) return null;
            const confidence = Math.max(0, Math.min(100, Math.round(Number(item.confidence) || 0)));
            return {
              id: disease.id,
              name: disease.name,
              description: disease.description,
              confidence,
              cues: Array.isArray(item.cues) ? item.cues.filter(c => typeof c === 'string').slice(0, 3) : [],
              steps: disease.steps,
            } as DiagnosisCandidate;
          })
          .filter((c): c is DiagnosisCandidate => c !== null)
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 3);
        if (mapped.length === 0) return null;
        return { candidates: mapped, notes };
      };

      let result: DiagnosisResult | null = null;
      let notes: string | undefined;
      if (parsed) {
        try {
          const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
          const maybeNotes = JSON.parse(cleaned).notes;
          if (typeof maybeNotes === 'string' && maybeNotes.trim()) notes = maybeNotes.trim();
        } catch { /* notes are optional */ }
        result = buildResult(parsed, notes);
      } else {
        // Back-compat: model returned a bare disease id instead of JSON
        const resultId = raw.toLowerCase();
        const matchedDisease = DISEASE_DATABASE.find(d => d.id === resultId);
        if (matchedDisease) {
          result = buildResult([{ id: matchedDisease.id, confidence: 65, cues: [] }]);
        }
      }

      if (result) {
        setDiagnosisResult(result);
        const top = result.candidates[0];
        if (top.confidence >= 60) {
          setFormDiseaseId(top.id);
          toast.success(`AI identified: ${top.name} (${top.confidence}%)`);
        } else {
          toast.info("AI is unsure — review the options before picking one.");
        }
      } else {
        setDiagnosisResult({ id: 'manual', name: "Unknown", description: "The AI couldn't confidently identify the issue. Please select manually or enter details below." });
        setFormDiseaseId('manual');
        toast.info("AI couldn't identify the issue. Please enter details manually.");
      }
    } catch (error) {
      console.error("Diagnosis error:", error);
      setDiagnosisResult({ id: 'manual', name: "Error", description: "AI diagnosis failed. Please enter details manually." });
      setFormDiseaseId('manual');
      toast.error("AI diagnosis failed.");
    } finally {
      setIsDiagnosing(false);
    }
  };

  // Logs a wrong AI call to Firestore so corrections improve future suggestions.
  const handleDiagnosisCorrection = async (text: string) => {
    if (!user) return;
    try {
      const cands = (diagnosisResult as DiagnosisResult)?.candidates || [];
      await addDoc(collection(db, 'ai_diagnosis_corrections'), {
        ownerUid: user.uid,
        plantId: formPlantId,
        plantName: allPlants.find(p => p.id === formPlantId)?.name || '',
        symptoms: formSymptoms,
        candidates: cands.map(c => ({ id: c.id, name: c.name, confidence: c.confidence })),
        correctionText: text,
        createdAt: serverTimestamp(),
      });
      setFormDiseaseId('manual');
      toast.success("Correction logged — thanks! Describe it manually below.");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'ai_diagnosis_corrections');
    }
  };

  const handleLogTreatment = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeLogTreatment(false);
  };

  const executeLogTreatment = async (force = false) => {
    if (!user || !formPlantId || !formDiseaseId) return;

    const plant = allPlants.find(p => p.id === formPlantId);
    let diseaseName = '';
    let diseaseId = formDiseaseId;
    let treatmentDesc = '';
    let steps: string[] = [];
    let materials: string[] = [];

    if (formDiseaseId === 'manual') {
      diseaseName = formManualDisease || 'Unknown Affliction';
      treatmentDesc = formManualTreatment || 'Manual treatment applied';
      steps = [treatmentDesc];
    } else {
      const disease = DISEASE_DATABASE.find(d => d.id === formDiseaseId);
      if (!disease) return;
      diseaseName = disease.name;
      treatmentDesc = disease.description;
      steps = disease.steps;
      materials = disease.materials;
    }

    if (!plant) return;

    // Conflict Checker
    const treatmentType = materials.includes('Neem oil') ? 'Neem Oil' : materials.includes('Sulfur fungicide') ? 'Sulfur' : 'Other';
    
    if (!force) {
      const conflictCheck = checkTreatmentConflict(treatmentType, eventLogs.filter(l => l.targetId === formPlantId));
      
      if (conflictCheck.conflict && conflictCheck.conflictingLog) {
        setConflictModalData({
          isOpen: true,
          message: conflictCheck.message || '',
          action: treatmentType,
          conflictingAction: conflictCheck.conflictingLog.eventType || conflictCheck.conflictingLog.type || 'Unknown',
          conflictingDate: new Date(conflictCheck.conflictingLog.date).toLocaleDateString()
        });
        return;
      }
    }

    try {
      const stepsStr = steps.join(', ');
      const treatmentRef = await logEvent({
        ownerUid: user.uid,
        category: 'treatments',
        data: {
          plantId: formPlantId,
          plantName: plant.name,
          plotId: plant.plotId || activePlotId || null,
          disease: diseaseName,
          diseaseId: diseaseId,
          treatment: treatmentDesc,
          treatmentUsed: stepsStr,
          treatmentType: treatmentType,
          steps: steps,
          materials: materials,
          symptoms: formSymptoms,
          status: 'Active',
          successRate: parseInt(formSuccessRate) || null,
        },
        calendarTitle: `Treatment: ${diseaseName} on ${plant.name}`,
        calendarDescription: `Started treatment for ${diseaseName}. Symptoms: ${formSymptoms}. Steps: ${stepsStr}`,
        eventType: 'Treatment',
        targetId: formPlantId,
        targetType: 'Inhabitant'
      });

      // Mark plant as struggling and recompute vigor from the new active treatment
      const newTreatment = { id: treatmentRef?.id, plantId: formPlantId, status: 'Active', successRate: parseInt(formSuccessRate) || null };
      if (plant.status !== 'Struggling') {
        await updateDoc(doc(db, 'inhabitants', formPlantId), { status: 'Struggling' });
      }
      recalculateVigor({ ...plant, status: 'Struggling' } as any, undefined, [...treatmentLogs, newTreatment] as any).catch(() => {});

      setIsLogFormOpen(false);
      setFormPlantId('');
      setFormDiseaseId('');
      setFormSymptoms('');
      setFormSuccessRate('100');
      setFormManualDisease('');
      setFormManualTreatment('');
      setDiagnosisResult(null);
      setConflictModalData(null);
      toast.success("Treatment logged successfully!");
    } catch (error) {
      // Error handled by logEvent
    }
  };

  const handleUpdateSuccessRate = async (logId: string) => {
    const rate = parseInt(editSuccessRateValue);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast.error("Please enter a valid success rate (0-100)");
      return;
    }

    try {
      await updateDoc(doc(db, 'treatments', logId), {
        successRate: rate
      });
      setEditingSuccessRateId(null);
      toast.success("Success rate updated!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `treatments/${logId}`);
    }
  };

  const handleDeleteLog = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'treatments', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `treatments/${id}`);
    }
  };

  return (
    <div className="px-6 max-w-6xl mx-auto py-8 space-y-12 pb-32">
      {/* Header */}
      <section className="space-y-4 relative">
        <div className="absolute -top-10 -left-10 opacity-5 pointer-events-none">
          <Leaf size={120} className="text-primary rotate-12" />
        </div>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 relative z-10"
        >
          <div className="w-12 h-12 bg-tertiary-container/20 rounded-2xl flex items-center justify-center text-tertiary">
            <HeartPulse size={28} />
          </div>
          <h2 className="font-headline text-4xl md:text-5xl font-black text-primary tracking-tighter leading-none">
            Botanical <br/><span className="text-tertiary">Treatment.</span>
          </h2>
        </motion.div>
        <div className="bg-tertiary/5 border-l-4 border-tertiary p-4 rounded-r-2xl relative z-10">
          <p className="text-tertiary font-medium italic">"{dailyComment}"</p>
        </div>
        <p className="text-on-surface-variant text-lg max-w-lg leading-relaxed relative z-10">
          Identify afflictions, log treatments, and track the recovery of your botanical patients.
        </p>
        {activePlot && (
          <p className="relative z-10 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary bg-primary/10 px-4 py-1.5 rounded-full w-fit">
            Showing {activePlot.name}
          </p>
        )}
      </section>

      {/* Action Buttons */}
      <div className="flex gap-4">
        <button 
          onClick={() => setIsLogFormOpen(true)}
          className="flex-1 md:flex-none px-8 py-4 bg-primary text-white rounded-full font-headline font-black uppercase tracking-widest text-sm shadow-xl shadow-primary/20 flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all organic-border"
        >
          <Plus size={20} /> Log New Treatment
        </button>
      </div>

      {/* Sick Plants Grid */}
      <section className="space-y-6 relative">
        <div className="absolute -right-10 top-0 opacity-5 pointer-events-none">
          <Flower2 size={160} className="text-primary" />
        </div>
        <div className="flex justify-between items-end relative z-10">
          <h3 className="font-headline text-2xl font-bold text-primary">Plants in Recovery</h3>
          <span className="text-xs font-black uppercase tracking-widest text-tertiary bg-tertiary/10 px-4 py-1.5 rounded-full">
            {visibleSickPlants.length} Active Cases
          </span>
        </div>

        {visibleSickPlants.length === 0 ? (
          <div className="glass-card p-12 rounded-[3rem] text-center border-2 border-dashed border-outline-variant/30 relative z-10">
            <CheckCircle className="mx-auto text-primary mb-4" size={48} />
            <p className="font-headline font-bold text-xl text-primary">All plants are thriving!</p>
            <p className="text-on-surface-variant">No active diseases or struggling plants detected.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
            {visibleSickPlants.map((plant) => (
              <motion.div 
                key={plant.id}
                layoutId={plant.id}
                onClick={() => setSelectedPlant(plant)}
                className="glass-card rounded-[2.5rem] p-6 shadow-sm border border-outline-variant/10 cursor-pointer hover:shadow-xl transition-all group overflow-hidden"
              >
                <div className="aspect-video rounded-3xl overflow-hidden mb-6 relative">
                  <img src={plant.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                  <div className="absolute top-4 right-4 bg-error-container text-on-error-container px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg">
                    Struggling
                  </div>
                </div>
                <div className="space-y-4 relative">
                  <div className="absolute -bottom-4 -right-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                    <Leaf size={80} className="text-primary" />
                  </div>
                  <div className="relative z-10">
                    <h4 className="font-headline text-2xl font-black text-on-surface">{plant.name}</h4>
                    <p className="text-xs text-on-surface-variant italic">{plant.scientific}</p>
                  </div>
                  <div className="flex items-center gap-3 text-tertiary relative z-10">
                    <AlertTriangle size={18} />
                    <span className="text-sm font-bold">Vigor Index: {plant.vigorIndex}%</span>
                  </div>
                  <button className="w-full py-4 bg-surface-container-high text-primary rounded-full font-bold text-sm group-hover:bg-primary group-hover:text-white transition-all relative z-10">
                    Diagnose & Treat
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Productivity Checklist */}
      <section className="bg-surface-container-low p-6 rounded-[2rem] border border-outline-variant/10 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <Check size={18} />
            </div>
            <h3 className="font-headline font-bold text-lg">Treatment Protocol Checklist</h3>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">3 Tasks Pending</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            'Inspect for New Pests',
            'Verify Treatment Success',
            'Update Recovery Status'
          ].map((item) => (
            <label key={item} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-outline-variant/5 cursor-pointer hover:bg-primary/5 transition-colors group">
              <input type="checkbox" className="rounded text-primary focus:ring-primary/20" />
              <span className="text-xs font-bold text-on-surface-variant group-hover:text-primary">{item}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Treatment Log Table */}
      <section className="space-y-6 relative">
        <div className="absolute -right-20 top-0 opacity-5 pointer-events-none">
          <Flower2 size={200} className="text-primary" />
        </div>
        <h3 className="font-headline text-2xl font-bold text-primary flex items-center gap-3 relative z-10">
          <ClipboardList size={24} /> Treatment Log
        </h3>
        <div className="glass-card rounded-[2.5rem] overflow-hidden border border-outline-variant/10 shadow-sm relative z-10">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low">
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Plant</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Affliction</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Treatment Used</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Success</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Status</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {visibleTreatmentLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-12 text-center text-on-surface-variant italic">No treatments logged yet.</td>
                  </tr>
                ) : (
                  visibleTreatmentLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-surface-container-lowest transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl overflow-hidden shadow-sm">
                            <img 
                              src={allPlants.find(p => p.id === log.plantId)?.image} 
                              alt="Plant" 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <div>
                            <p className="font-bold text-on-surface">{log.plantName}</p>
                            <p className="text-[10px] text-on-surface-variant">
                              {log.createdAt && typeof log.createdAt.toDate === 'function' 
                                ? log.createdAt.toDate().toLocaleDateString() 
                                : 'Recently'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className="text-sm font-medium text-error flex items-center gap-2">
                          <Bug size={14} /> {log.disease}
                        </span>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-xs font-medium text-on-surface-variant line-clamp-1">{log.treatmentUsed || 'Standard Protocol'}</p>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2">
                          {editingSuccessRateId === log.id ? (
                            <div className="flex items-center gap-2">
                              <input 
                                type="number"
                                min="0"
                                max="100"
                                value={editSuccessRateValue}
                                onChange={(e) => setEditSuccessRateValue(e.target.value)}
                                className="w-16 p-1 text-xs bg-surface-container-high rounded border-none focus:ring-1 focus:ring-primary"
                                autoFocus
                              />
                              <button 
                                onClick={() => handleUpdateSuccessRate(log.id)}
                                className="p-1 text-primary hover:bg-primary/10 rounded"
                              >
                                <CheckCircle size={14} />
                              </button>
                            </div>
                          ) : (
                            <div 
                              className={cn(
                                "flex items-center gap-2",
                                log.status === 'Resolved' && "cursor-pointer hover:opacity-80"
                              )}
                              onClick={() => {
                                if (log.status === 'Resolved') {
                                  setEditingSuccessRateId(log.id);
                                  setEditSuccessRateValue(String(log.successRate || 0));
                                }
                              }}
                            >
                              <div className="w-12 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                                <div 
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    (log.successRate || 0) > 70 ? "bg-primary" : (log.successRate || 0) > 40 ? "bg-tertiary" : "bg-error"
                                  )}
                                  style={{ width: `${log.successRate || 0}%` }}
                                />
                              </div>
                              <span className={cn(
                                "text-[10px] font-bold",
                                log.status === 'Resolved' ? (
                                  (log.successRate || 0) > 70 ? "text-primary" : (log.successRate || 0) > 40 ? "text-tertiary" : "text-error"
                                ) : "text-on-surface-variant"
                              )}>
                                {log.successRate !== null && log.successRate !== undefined ? `${log.successRate}%` : 'N/A'}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                          log.status === 'Active' ? "bg-tertiary/10 text-tertiary" : "bg-primary/10 text-primary"
                        )}>
                          {log.status}
                        </span>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setSelectedLog(log)}
                            className="p-2 text-primary hover:bg-primary/10 rounded-full transition-all"
                          >
                            <Info size={18} />
                          </button>
                          <button 
                            onClick={() => handleDeleteLog(log.id)}
                            className="p-2 text-on-surface-variant hover:text-error transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <XCircle size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* AI Correction Review */}
      <CorrectionReviewList />

      {/* Disease Database Grid */}
      <section className="space-y-8 relative">
        <div className="absolute -left-10 bottom-0 opacity-5 pointer-events-none">
          <Leaf size={180} className="text-secondary -rotate-12" />
        </div>
        <div className="flex justify-between items-end relative z-10">
          <div>
            <h3 className="font-headline text-3xl font-bold text-primary">Botanical Encyclopedia</h3>
            <p className="text-on-surface-variant">The 15 most common garden villains and how to defeat them.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10">
          {DISEASE_DATABASE.map((disease) => (
            <motion.div 
              key={disease.id}
              whileHover={{ y: -5 }}
              className="glass-card rounded-[2.5rem] p-8 border border-outline-variant/10 shadow-sm space-y-6 overflow-hidden group"
            >
              <div className="aspect-square rounded-3xl overflow-hidden relative">
                <img src={disease.image} alt={disease.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" referrerPolicy="no-referrer" />
                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-4 py-1.5 rounded-full shadow-lg">
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary">Pest/Disease</p>
                </div>
              </div>
              <div className="space-y-4 relative">
                <div className="absolute -bottom-4 -right-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                  <Flower2 size={100} className="text-secondary" />
                </div>
                <div className="relative z-10">
                  <h4 className="font-headline text-2xl font-black text-primary">{disease.name}</h4>
                  <p className="text-sm text-on-surface-variant leading-relaxed">{disease.description}</p>
                </div>
                
                <div className="space-y-3 relative z-10">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-2">
                    <Sun size={12} /> Typically Affects
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {disease.plants.map((p, i) => (
                      <span key={i} className="text-[10px] font-bold text-primary bg-primary/5 px-3 py-1 rounded-full uppercase tracking-wider">{p}</span>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-outline-variant/10 space-y-4 relative z-10">
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-2">
                      <ListChecks size={12} /> Treatment Steps
                    </p>
                    <ul className="space-y-1">
                      {disease.steps.map((s, i) => (
                        <li key={i} className="text-xs font-medium text-on-surface-variant flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-tertiary shrink-0" /> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-2">
                      <Beaker size={12} /> Materials Needed
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {disease.materials.map((m, i) => (
                        <span key={i} className="text-[10px] font-bold text-tertiary bg-tertiary/5 px-2 py-1 rounded-md">{m}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Log Treatment Modal */}
      <AnimatePresence>
        {isLogFormOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLogFormOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100]"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fixed inset-0 flex items-center justify-center z-[110] p-6 pointer-events-none"
            >
              <div className="bg-surface w-full max-w-xl rounded-[3rem] shadow-2xl overflow-hidden pointer-events-auto">
                <div className="p-10 space-y-8">
                  <div className="flex justify-between items-center">
                    <h3 className="font-headline text-3xl font-black text-primary tracking-tighter">Log Treatment</h3>
                    <button onClick={() => setIsLogFormOpen(false)} className="text-on-surface-variant"><XCircle size={28} /></button>
                  </div>

                  <form onSubmit={handleLogTreatment} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-2">Select Patient</label>
                      <select 
                        required
                        value={formPlantId}
                        onChange={(e) => setFormPlantId(e.target.value)}
                        className="w-full p-4 bg-surface-container-high rounded-2xl border-none focus:ring-2 focus:ring-primary transition-all"
                      >
                        <option value="">Choose a plant...</option>
                        {visibleAllPlants.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.status})</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-2">Describe Symptoms</label>
                      <div className="relative">
                        <textarea 
                          value={formSymptoms}
                          onChange={(e) => setFormSymptoms(e.target.value)}
                          placeholder="e.g., white spots on leaves, yellowing edges..."
                          className="w-full p-4 bg-surface-container-high rounded-2xl border-none focus:ring-2 focus:ring-primary transition-all min-h-[100px]"
                        />
                        <button 
                          type="button"
                          disabled={!formSymptoms || !formPlantId || isDiagnosing}
                          onClick={() => handleAIDiagnosis()}
                          className="absolute bottom-4 right-4 bg-primary text-white px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg disabled:opacity-50 flex items-center gap-2"
                        >
                          {isDiagnosing ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <ShieldCheck size={14} />}
                          AI Identify
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-2">Upload Photo (Optional)</label>
                      <div className="flex items-center gap-4">
                        <label className="flex-1 cursor-pointer">
                          <div className="w-full p-8 bg-surface-container-high rounded-2xl border-2 border-dashed border-outline-variant/30 hover:border-primary/50 transition-all flex flex-col items-center justify-center gap-3 group">
                            {formImagePreview ? (
                              <img src={formImagePreview} className="w-full h-32 object-cover rounded-xl shadow-lg" />
                            ) : (
                              <>
                                <Camera size={32} className="text-on-surface-variant group-hover:text-primary transition-colors" />
                                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Tap to capture or upload</span>
                              </>
                            )}
                          </div>
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleImageChange} 
                            className="hidden" 
                          />
                        </label>
                        {formImagePreview && (
                          <button 
                            type="button"
                            onClick={() => { setFormImage(null); setFormImagePreview(null); }}
                            className="p-3 bg-error/10 text-error rounded-full hover:bg-error/20 transition-all"
                          >
                            <XCircle size={20} />
                          </button>
                        )}
                      </div>
                    </div>

                    {diagnosisResult && (diagnosisResult as DiagnosisResult).candidates ? (
                      <DiagnosisPanel
                        diagnosis={diagnosisResult as DiagnosisResult}
                        selectedId={formDiseaseId}
                        onSelect={(id) => setFormDiseaseId(id)}
                        onRerun={(ctx) => handleAIDiagnosis(ctx)}
                        onCorrection={handleDiagnosisCorrection}
                        onSkip={() => setDiagnosisResult(null)}
                        isDiagnosing={isDiagnosing}
                      />
                    ) : diagnosisResult && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 bg-tertiary/10 rounded-2xl border border-tertiary/20"
                      >
                        <p className="text-[10px] font-black uppercase tracking-widest text-tertiary mb-1">AI Suggestion</p>
                        <p className="font-bold text-primary">{diagnosisResult.name}</p>
                        <p className="text-xs text-on-surface-variant">{diagnosisResult.description}</p>
                      </motion.div>
                    )}

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-2">Confirm Affliction</label>
                      <select 
                        required
                        value={formDiseaseId}
                        onChange={(e) => setFormDiseaseId(e.target.value)}
                        className="w-full p-4 bg-surface-container-high rounded-2xl border-none focus:ring-2 focus:ring-primary transition-all"
                      >
                        <option value="">Choose a disease/pest...</option>
                        {DISEASE_DATABASE.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                        <option value="manual">Other / Manual Entry</option>
                      </select>
                    </div>

                    {formDiseaseId === 'manual' && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-4"
                      >
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-2">Disease Name</label>
                          <input 
                            required
                            type="text"
                            value={formManualDisease}
                            onChange={(e) => setFormManualDisease(e.target.value)}
                            placeholder="Enter disease name..."
                            className="w-full p-4 bg-surface-container-high rounded-2xl border-none focus:ring-2 focus:ring-primary transition-all"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-2">Treatment Plan</label>
                          <textarea 
                            required
                            value={formManualTreatment}
                            onChange={(e) => setFormManualTreatment(e.target.value)}
                            placeholder="Describe the treatment steps..."
                            className="w-full p-4 bg-surface-container-high rounded-2xl border-none focus:ring-2 focus:ring-primary transition-all min-h-[80px]"
                          />
                        </div>
                      </motion.div>
                    )}

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-2">Success Rate (%)</label>
                      <input 
                        type="number"
                        min="0"
                        max="100"
                        value={formSuccessRate}
                        onChange={(e) => setFormSuccessRate(e.target.value)}
                        className="w-full p-4 bg-surface-container-high rounded-2xl border-none focus:ring-2 focus:ring-primary transition-all"
                      />
                    </div>

                    <div className="pt-4">
                      <button 
                        type="submit"
                        className="w-full py-6 bg-primary text-white rounded-full font-headline font-black uppercase tracking-widest text-sm shadow-2xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                      >
                        Start Treatment Plan
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Plant Detail Modal (Existing) */}
      <AnimatePresence>
        {selectedPlant && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPlant(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-[80]"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="fixed bottom-0 left-0 right-0 z-[90] bg-surface rounded-t-[3.5rem] max-h-[90vh] overflow-hidden max-w-3xl mx-auto flex flex-col"
            >
              <div className="p-10 overflow-y-auto hide-scrollbar">
                <div className="flex justify-between items-start mb-8">
                  <div className="flex gap-6 items-center">
                    <div className="w-24 h-24 rounded-3xl overflow-hidden shadow-2xl">
                      <img src={selectedPlant.image} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <h3 className="font-headline text-4xl font-black text-on-surface tracking-tighter">{selectedPlant.name}</h3>
                      <p className="text-on-surface-variant font-medium">Treatment Protocol</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedPlant(null)} className="p-4 bg-surface-container-high rounded-full"><XCircle size={24} /></button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                  <div className="bg-error-container/20 p-8 rounded-[2.5rem] border border-error/10 space-y-4">
                    <div className="flex items-center gap-3 text-error">
                      <Bug size={24} />
                      <h4 className="font-headline font-bold text-xl">Detected Issues</h4>
                    </div>
                    <ul className="space-y-3">
                      {treatmentLogs.filter(l => l.plantId === selectedPlant.id && l.status === 'Active').map((log, i) => (
                        <li key={i} className="flex items-center gap-3 text-sm font-medium text-on-surface-variant">
                          <div className="w-1.5 h-1.5 rounded-full bg-error" />
                          {log.disease}
                        </li>
                      ))}
                      {treatmentLogs.filter(l => l.plantId === selectedPlant.id && l.status === 'Active').length === 0 && (
                        <li className="text-sm text-on-surface-variant italic">No active treatments logged.</li>
                      )}
                    </ul>
                  </div>

                  <div className="bg-primary-container/10 p-8 rounded-[2.5rem] border border-primary/10 space-y-4">
                    <div className="flex items-center gap-3 text-primary">
                      <FlaskConical size={24} />
                      <h4 className="font-headline font-bold text-xl">Recovery Plan</h4>
                    </div>
                    <div className="space-y-4">
                      {treatmentLogs.filter(l => l.plantId === selectedPlant.id && l.status === 'Active').slice(0, 1).map((log, i) => (
                        <div key={i} className="space-y-2">
                          {log.steps?.map((step: string, j: number) => (
                            <div key={j} className="flex items-center gap-3 text-sm font-medium text-on-surface-variant">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                              {step}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-12 flex gap-4">
                  <button 
                    onClick={() => handleResolve(selectedPlant.id)}
                    className="flex-1 py-6 bg-primary text-white rounded-full font-headline font-black uppercase tracking-widest text-sm shadow-2xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    Mark as Recovered
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Treatment Detail Modal */}
      <AnimatePresence>
        {selectedLog && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedLog(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-[120]"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fixed inset-0 flex items-center justify-center z-[130] p-6 pointer-events-none"
            >
              <div className="bg-surface w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden pointer-events-auto max-h-[80vh] flex flex-col">
                <div className="p-10 overflow-y-auto hide-scrollbar space-y-8">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-headline text-3xl font-black text-primary tracking-tighter">{selectedLog.disease}</h3>
                      <p className="text-on-surface-variant font-bold">Treatment for {selectedLog.plantName}</p>
                    </div>
                    <button onClick={() => setSelectedLog(null)} className="text-on-surface-variant"><XCircle size={28} /></button>
                  </div>

                  <div className="space-y-6">
                    <div className="bg-surface-container-high p-6 rounded-3xl space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Symptoms Reported</p>
                      <p className="text-on-surface italic">"{selectedLog.symptoms || 'No symptoms recorded.'}"</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-2">
                          <ListChecks size={14} /> Treatment Steps
                        </p>
                        <div className="space-y-2">
                          {selectedLog.steps?.map((step: string, i: number) => (
                            <div key={i} className="flex items-start gap-3 text-sm font-medium text-on-surface-variant">
                              <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] shrink-0">{i + 1}</div>
                              {step}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-2">
                          <Beaker size={14} /> Materials
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {selectedLog.materials?.map((m: string, i: number) => (
                            <span key={i} className="px-3 py-1.5 bg-tertiary/10 text-tertiary rounded-xl text-xs font-bold">{m}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {/* Treatment Conflict Modal */}
      {conflictModalData && (
        <TreatmentConflictModal 
          isOpen={conflictModalData.isOpen}
          onClose={() => setConflictModalData(null)}
          onConfirm={() => executeLogTreatment(true)}
          conflictMessage={conflictModalData.message}
          actionName={conflictModalData.action}
          conflictingAction={conflictModalData.conflictingAction}
          conflictingDate={conflictModalData.conflictingDate}
        />
      )}
    </div>
  );
}

function ComparisonCard({ name, image }: { name: string, image: string }) {
  return (
    <motion.div 
      whileHover={{ scale: 1.05 }}
      className="group cursor-pointer"
    >
      <div className="aspect-[4/5] rounded-3xl overflow-hidden mb-4 relative">
        <img src={image} alt={name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" referrerPolicy="no-referrer" />
        <div className="absolute bottom-4 left-4 right-4 bg-white/60 backdrop-blur-md p-3 rounded-2xl">
          <p className="font-bold text-primary text-sm">{name}</p>
        </div>
      </div>
    </motion.div>
  );
}
