import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Target, Stethoscope, Sprout, Eye, ArrowRight, Check } from 'lucide-react';
import WeedWarriorWizard from './WeedWarriorWizard';
import BotanicalPatientWizard from './BotanicalPatientWizard';
import { useProgress } from '../contexts/ProgressContext';
import { logEvent } from '../services/eventService';
import { useFirebase } from '../contexts/FirebaseContext';
import { toast } from 'sonner';
import { wizardTreatmentRecord, wizardWeedingRecord } from '../lib/wizardWrites';

interface MasterWizardProps {
  type: string;
  onClose: () => void;
}

const MasterWizard: React.FC<MasterWizardProps> = ({ type, onClose }) => {
  const { user } = useFirebase();
  const { addXP } = useProgress();
  const [isSubWizardOpen, setIsSubWizardOpen] = useState(true);

  const handleWeedingSave = async (data: any) => {
    if (!user) return;

    try {
      // The global action button launches this wizard with no plot. Spreading
      // that payload writes undefined plot fields (the client rejects the whole
      // add) and a numeric canopy score the weeding_events rules do not allow.
      const record = wizardWeedingRecord(data);
      const place = (record.zone as string) || 'Garden';
      await logEvent({
        ownerUid: user.uid,
        category: 'weeding_events',
        data: record,
        calendarTitle: `Weeding: ${record.weedType} in ${place}`.slice(0, 190),
        calendarDescription: `Cleared ${data.areaCleared ?? 0} sq ft of ${record.weedType} using ${data.method || 'an unspecified method'}. WEQ: ${Number(data.weq || 0).toFixed(2)}`.slice(0, 1900),
        eventType: 'Weeding',
        ...(typeof record.plotId === 'string'
          ? { targetId: record.plotId, targetType: 'SpatialPlot' as const }
          : {}),
      });

      await addXP(Number(record.xp) || 0);
      onClose();
    } catch (error) {
      console.error('Error logging weeding event:', error);
      toast.error('Could not save that weeding log.');
    }
  };

  const handleTreatmentSave = async (data: any) => {
    if (!user) return;

    try {
      const record = wizardTreatmentRecord(data);
      const place = (record.plotName as string) || 'Garden';
      await logEvent({
        ownerUid: user.uid,
        category: 'treatment_events',
        data: record,
        calendarTitle: `Treatment: ${record.treatment} in ${place}`.slice(0, 190),
        calendarDescription: `Diagnosis: ${record.diagnosis}. Dosage: ${record.dosage ?? 1}x. Notes: ${record.notes || ''}`.slice(0, 1900),
        eventType: 'Treatment',
        ...(typeof record.plotId === 'string'
          ? { targetId: record.plotId, targetType: 'SpatialPlot' as const }
          : {}),
      });

      await addXP(Number(record.xp) || 0);
      onClose();
    } catch (error) {
      console.error('Error logging treatment event:', error);
      toast.error('Could not save that treatment log.');
    }
  };

  // For now, we'll just handle Weeding and Treatment. Others will be added or use a generic form.
  if (type === 'weeding') {
    return (
      <WeedWarriorWizard 
        isOpen={isSubWizardOpen} 
        onClose={onClose} 
        onSave={handleWeedingSave} 
      />
    );
  }

  if (type === 'treatment') {
    return (
      <BotanicalPatientWizard 
        isOpen={isSubWizardOpen} 
        onClose={onClose} 
        onSave={handleTreatmentSave} 
      />
    );
  }

  // Placeholder for other wizards
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-[2.5rem] w-full max-w-lg p-8 shadow-2xl relative"
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-2 hover:bg-stone-100 rounded-full"><X /></button>
        <div className="text-center space-y-6">
          <div className="w-20 h-20 bg-primary/10 text-primary rounded-3xl flex items-center justify-center mx-auto">
            {type === 'treatment' && <Stethoscope size={40} />}
            {type === 'planting' && <Sprout size={40} />}
            {type === 'observation' && <Eye size={40} />}
          </div>
          <div>
            <h2 className="text-3xl font-black font-headline capitalize">{type} Wizard</h2>
            <p className="text-stone-500 font-medium mt-2">This tactical briefing module is currently being provisioned.</p>
          </div>
          <button 
            onClick={onClose}
            className="w-full bg-primary text-white font-black py-4 rounded-2xl hover:shadow-lg transition-all"
          >
            Acknowledge
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default MasterWizard;
