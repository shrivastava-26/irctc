import React, { useState, useEffect } from 'react';
import { Box, Container, CssBaseline, ThemeProvider } from '@mui/material';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Header from './components/Header';
import BookTab from './components/BookTab';
import AccountsTab from './components/AccountsTab';
import JourneysTab from './components/JourneysTab';
import JobsTab from './components/JobsTab';
import AutomationDialog from './components/AutomationDialog';

const API = '/api';

export default function App() {
  const [tab, setTab] = useState('book');
  
  // Global State
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [journeys, setJourneys] = useState([]);
  const [activeJobs, setActiveJobs] = useState([]); 
  const [showAutomationDialog, setShowAutomationDialog] = useState(false);

  // Load from local storage
  useEffect(() => {
    try {
      const savedAccs = JSON.parse(localStorage.getItem('irctc_accounts') || '[]');
      setAccounts(savedAccs);
      const selAcc = localStorage.getItem('irctc_selected_account');
      if (selAcc && savedAccs.some(a => a.id === selAcc)) {
        setSelectedAccountId(selAcc);
      } else if (savedAccs.length > 0) {
        setSelectedAccountId(savedAccs[0].id);
      }

      const savedJourneys = JSON.parse(localStorage.getItem('irctc_journeys') || '[]');
      setJourneys(savedJourneys);
    } catch {
      // ignore
    }
  }, []);

  const saveAccounts = (newAccs) => {
    setAccounts(newAccs);
    localStorage.setItem('irctc_accounts', JSON.stringify(newAccs));
    if (newAccs.length === 0) setSelectedAccountId('');
    else if (!newAccs.some(a => a.id === selectedAccountId)) setSelectedAccountId(newAccs[0].id);
  };

  const selectAccount = (id) => {
    setSelectedAccountId(id);
    localStorage.setItem('irctc_selected_account', id);
    toast.success('Account selected');
  };

  const saveJourneys = (newJourneys) => {
    setJourneys(newJourneys);
    localStorage.setItem('irctc_journeys', JSON.stringify(newJourneys));
  };

  const startAutomation = async () => {
    const account = accounts.find(a => a.id === selectedAccountId);
    if (!account) {
      toast.error('Please select an IRCTC account first.');
      return;
    }
    if (journeys.length === 0) {
      toast.error('No journeys available to run.');
      return;
    }

    const newJobIds = [];
    let started = 0;
    
    // Submit all journeys
    for (const journey of journeys) {
      const payload = {
        credentialsReference: account.username,
        source: journey.source.toUpperCase(),
        destination: journey.destination.toUpperCase(),
        travelDate: journey.travelDate ? journey.travelDate : '',
        quota: journey.quota,
        trainNumber: journey.trainNumber,
        coach: journey.coach.toUpperCase(),
        boardingStation: journey.boardingStation ? journey.boardingStation.toUpperCase() : undefined,
        passengers: journey.passengers,
        paymentPreference: { method: 'UPI', upiId: journey.upiId },
        executionMode: journey.executionMode,
        scheduledAt: journey.executionMode === 'SCHEDULED' ? journey.scheduledAt : undefined,
        isMock: journey.isMock,
        browser: 'edge', 
      };

      try {
        const res = await fetch(`${API}/jobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(`Failed: ${data.error || 'Job creation failed'}`);
          continue;
        }
        newJobIds.push(data.id);
        started++;
      } catch (err) {
        toast.error(`Error: ${err.message}`);
      }
    }

    if (newJobIds.length > 0) {
      toast.success(`Started ${started} automation job(s)`);
      setActiveJobs(prev => [...prev, ...newJobIds]);
      setShowAutomationDialog(true);
      // Optionally clear journeys here, but for personal use keeping them is fine.
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f4f6f8' }}>
      <Header tab={tab} setTab={setTab} />
      
      <Container maxWidth="lg" sx={{ flexGrow: 1, py: 2 }}>
        {tab === 'book' && (
           <BookTab 
             accounts={accounts}
             selectedAccountId={selectedAccountId}
             journeys={journeys}
             onStart={startAutomation}
             activeJobsCount={activeJobs.length}
             onOpenDialog={() => setShowAutomationDialog(true)}
           />
        )}
        
        {tab === 'accounts' && (
           <AccountsTab 
             accounts={accounts}
             selectedAccountId={selectedAccountId}
             onSave={saveAccounts}
             onSelect={selectAccount}
           />
        )}

        {tab === 'journeys' && (
           <JourneysTab 
             journeys={journeys}
             onSave={saveJourneys}
           />
        )}

        {tab === 'jobs' && <JobsTab />}
      </Container>

      <Box sx={{ color: 'text.secondary', p: 1, textAlign: 'center', mt: 'auto', fontSize: '0.75rem' }}>
        IRCTC Automation Client © {new Date().getFullYear()} — Personal Desktop App
      </Box>

      <ToastContainer position="bottom-right" autoClose={3000} hideProgressBar theme="colored" />

      <AutomationDialog 
        open={showAutomationDialog}
        activeJobs={activeJobs} 
        onClose={() => setShowAutomationDialog(false)} 
        onAddJourney={() => { setShowAutomationDialog(false); setTab('journeys'); }}
      />
    </Box>
  );
}
