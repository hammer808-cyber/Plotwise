import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, X, Check, Search, Sparkles, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { toast } from 'sonner';
import { db, collection, addDoc, serverTimestamp } from '../firebase';
import { useFirebase } from '../contexts/FirebaseContext';
import { buildTaxonomyDoc } from '../lib/taxonomy';

interface DiscoverySubWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onDiscovery: (newSpecies: any) => void;
  type: 'weed' | 'plant';
}

export default function DiscoverySubWizard({ isOpen, onClose, onDiscovery, type }: DiscoverySubWizardProps) {
  const { user } = useFirebase();
  const [step, setStep] = useState(0);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [threat, setThreat] = useState(5);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      toast.error("Could not access camera. Please check permissions.");
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        // Phone frames are multi-megabyte PNGs. Firestore rejects a document
        // over 1 MiB, so the whole discovery save failed. Keep a small JPEG.
        const MAX_DIM = 640;
        const srcW = videoRef.current.videoWidth || 640;
        const srcH = videoRef.current.videoHeight || 480;
        const scale = Math.min(1, MAX_DIM / Math.max(srcW, srcH));
        canvasRef.current.width = Math.max(1, Math.round(srcW * scale));
        canvasRef.current.height = Math.max(1, Math.round(srcH * scale));
        context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.72);
        setCapturedImage(dataUrl);
        
        // Stop camera
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        
        setStep(1);
        analyzeImage();
      }
    }
  };

  const analyzeImage = () => {
    setIsAnalyzing(true);
    // Simulate AI analysis
    setTimeout(() => {
      setIsAnalyzing(false);
      setName('Unknown ' + (type === 'weed' ? 'Invasive' : 'Specimen'));
      toast.info("AI Analysis complete. Please verify details.");
    }, 2000);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Please provide a name.");
      return;
    }

    if (!user) return;

    try {
      const newSpecies = {
        ...buildTaxonomyDoc({
          name,
          type,
          threat,
          icon: type === 'weed' ? '🌿' : '🌱',
          discoveredBy: user.uid,
          imageUrl: capturedImage,
        }),
        discoveredAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'custom_taxonomy'), newSpecies);
      onDiscovery(newSpecies);
      toast.success(`${name} added to your local taxonomy!`);
      onClose();
    } catch (error) {
      console.error("Error saving custom species:", error);
      toast.error("Failed to save discovery.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-[3rem] w-full max-w-lg overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="p-8 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-secondary/10 rounded-xl flex items-center justify-center text-secondary">
              <Sparkles size={20} />
            </div>
            <h3 className="text-xl font-black font-headline">Discovery Protocol</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full"><X /></button>
        </div>

        <div className="p-8 space-y-6">
          {step === 0 && (
            <div className="space-y-6">
              <div className="aspect-square bg-stone-900 rounded-[2rem] overflow-hidden relative">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 border-2 border-white/20 pointer-events-none flex items-center justify-center">
                  <div className="w-48 h-48 border-2 border-dashed border-white/40 rounded-full" />
                </div>
                {!videoRef.current?.srcObject && (
                  <button 
                    onClick={startCamera}
                    className="absolute inset-0 flex flex-col items-center justify-center text-white gap-4 bg-stone-900/50"
                  >
                    <Camera size={48} />
                    <span className="font-bold text-sm">Initialize Optical Sensor</span>
                  </button>
                )}
              </div>
              <button 
                onClick={capturePhoto}
                disabled={!videoRef.current?.srcObject}
                className="w-full py-5 bg-secondary text-white rounded-2xl font-black text-lg shadow-xl shadow-secondary/20 disabled:opacity-50"
              >
                Capture Specimen
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div className="relative aspect-video bg-stone-100 rounded-2xl overflow-hidden">
                {capturedImage && <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />}
                {isAnalyzing && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center text-white gap-4">
                    <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="font-black uppercase tracking-widest text-xs">AI Inference in Progress...</span>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Specimen Name</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-stone-100 border-none rounded-2xl px-6 py-4 font-bold"
                    placeholder="e.g. Mystery Vine"
                  />
                </div>

                {type === 'weed' && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Threat Level Assessment</label>
                      <span className="text-xl font-black text-secondary">{threat}/10</span>
                    </div>
                    <input 
                      type="range" 
                      min="1" 
                      max="10" 
                      value={threat} 
                      onChange={(e) => setThreat(parseInt(e.target.value))}
                      className="w-full h-2 bg-stone-100 rounded-full appearance-none cursor-pointer accent-secondary"
                    />
                  </div>
                )}
              </div>

              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex gap-3 items-start">
                <Info size={18} className="text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-blue-700">
                  This specimen will be added to your local taxonomy. Future sightings will be automatically recognized.
                </p>
              </div>

              <button 
                onClick={handleSave}
                className="w-full py-5 bg-primary text-white rounded-2xl font-black text-lg shadow-xl shadow-primary/20"
              >
                Confirm Discovery
              </button>
            </div>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </motion.div>
    </div>
  );
}
