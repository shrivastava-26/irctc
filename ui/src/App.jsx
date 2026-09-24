import React, { useEffect, useState } from 'react'
import { Box, Container } from '@mui/material'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

import Header from './components/Header'
import BookTab from './components/BookTab'
import AccountsTab from './components/AccountsTab'
import JourneysTab from './components/JourneysTab'
import JobsTab from './components/JobsTab'
import AutomationDialog from './components/AutomationDialog'

const API = '/api'

export default function App() {
  const [tab, setTab] = useState('book')
  const [accounts, setAccounts] = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [journeys, setJourneys] = useState([])
  const [activeJobs, setActiveJobs] = useState([])
  const [showAutomationDialog, setShowAutomationDialog] = useState(false)

  useEffect(() => {
    try {
      const savedAccs = JSON.parse(localStorage.getItem('irctc_accounts') || '[]')
      setAccounts(savedAccs)

      const selected = localStorage.getItem('irctc_selected_account')
      if (selected && savedAccs.some(account => account.id === selected)) {
        setSelectedAccountId(selected)
      } else if (savedAccs.length > 0) {
        setSelectedAccountId(savedAccs[0].id)
      }

      const savedJourneys = JSON.parse(localStorage.getItem('irctc_journeys') || '[]')
      setJourneys(savedJourneys)
    } catch {
      // Ignore malformed browser state.
    }
  }, [])

  const saveAccounts = (newAccounts) => {
    setAccounts(newAccounts)

    const safeAccounts = newAccounts.map(({ password, ...safe }) => safe)
    localStorage.setItem('irctc_accounts', JSON.stringify(safeAccounts))

    if (newAccounts.length === 0) {
      setSelectedAccountId('')
      localStorage.removeItem('irctc_selected_account')
      return
    }

    if (!newAccounts.some(account => account.id === selectedAccountId)) {
      const nextId = newAccounts[0].id
      setSelectedAccountId(nextId)
      localStorage.setItem('irctc_selected_account', nextId)
    }
  }

  const selectAccount = (id) => {
    setSelectedAccountId(id)
    localStorage.setItem('irctc_selected_account', id)
    toast.success('Account selected')
  }

  const saveJourneys = (newJourneys) => {
    setJourneys(newJourneys)
    localStorage.setItem('irctc_journeys', JSON.stringify(newJourneys))
  }

  const startAutomation = async () => {
    const account = accounts.find(item => item.id === selectedAccountId)

    if (!account) {
      toast.error('Please select an IRCTC account first.')
      return
    }

    if (journeys.length === 0) {
      toast.error('No journeys available to run.')
      return
    }

    const newJobIds = []
    let started = 0

    for (const journey of journeys) {
      const payload = {
        credentialsReference: account.username,
        source: String(journey.source || '').toUpperCase(),
        destination: String(journey.destination || '').toUpperCase(),
        travelDate: journey.travelDate || '',
        quota: journey.quota,
        trainNumber: journey.trainNumber,
        coach: String(journey.coach || '').toUpperCase(),
        boardingStation: journey.boardingStation
          ? String(journey.boardingStation).toUpperCase()
          : undefined,
        passengers: journey.passengers,
        paymentPreference: {
          method: 'UPI',
          upiId: journey.upiId,
        },
        executionMode: journey.executionMode,
        scheduledAt: journey.executionMode === 'SCHEDULED' ? journey.scheduledAt : undefined,
        isMock: journey.isMock,
        browser: 'edge',
      }

      try {
        const res = await fetch(API + '/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        const data = await res.json()

        if (!res.ok) {
          toast.error('Failed: ' + (data.error || 'Job creation failed'))
          continue
        }

        newJobIds.push(data.id)
        started += 1
      } catch (err) {
        toast.error('Error: ' + err.message)
      }
    }

    if (newJobIds.length > 0) {
      toast.success('Started ' + started + ' automation job(s)')
      setActiveJobs(prev => prev.concat(newJobIds))
      setShowAutomationDialog(true)
    }
  }

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      bgcolor: '#f4f6f8',
      overflowX: 'hidden',
    }}>
      <Header tab={tab} setTab={setTab} />

      <Container
        maxWidth="lg"
        sx={{
          flexGrow: 1,
          width: '100%',
          minWidth: 0,
          py: { xs: 1, sm: 2, md: 2.5 },
          px: { xs: 1, sm: 2, md: 3 },
        }}
      >
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
          <JourneysTab journeys={journeys} onSave={saveJourneys} />
        )}

        {tab === 'jobs' && <JobsTab />}
      </Container>

      <Box sx={{
        color: 'text.secondary',
        p: 1,
        px: 2,
        textAlign: 'center',
        mt: 'auto',
        fontSize: { xs: '0.62rem', sm: '0.72rem' },
        lineHeight: 1.4,
      }}>
        IRCTC Automation Client © {new Date().getFullYear()} — Personal Web / Desktop Client
      </Box>

      <ToastContainer
        position="bottom-right"
        autoClose={3000}
        hideProgressBar
        theme="colored"
        limit={3}
      />

      <AutomationDialog
        open={showAutomationDialog}
        activeJobs={activeJobs}
        onClose={() => setShowAutomationDialog(false)}
        onAddJourney={() => {
          setShowAutomationDialog(false)
          setTab('journeys')
        }}
      />
    </Box>
  )
}
