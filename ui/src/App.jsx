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
import {
  loadAccounts,
  loadJourneys,
  loadSelectedAccount,
  saveAccounts,
  saveJourneys,
  saveSelectedAccount,
} from './storage'

const API = '/api'

export default function App() {
  const [tab, setTab] = useState('book')
  const [accounts, setAccounts] = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [journeys, setJourneys] = useState([])
  const [activeJobs, setActiveJobs] = useState([])
  const [showAutomationDialog, setShowAutomationDialog] = useState(false)
  const [selectedJourneyIds, setSelectedJourneyIds] = useState([])

  useEffect(() => {
    const loadedAccounts = loadAccounts().map(account => ({
      ...account,
      id: String(account.id),
      password: account.password || '',
    }))
    const loadedJourneys = loadJourneys()

    setAccounts(loadedAccounts)
    setJourneys(loadedJourneys)

    const storedSelected = loadSelectedAccount()
    const validSelected = loadedAccounts.some(account => account.id === storedSelected)
      ? storedSelected
      : (loadedAccounts[0]?.id || '')

    setSelectedAccountId(validSelected)
    if (validSelected) saveSelectedAccount(validSelected)
  }, [])

  const handleAccountsSave = (nextAccounts) => {
    setAccounts(nextAccounts)
    saveAccounts(nextAccounts)

    if (nextAccounts.length === 0) {
      setSelectedAccountId('')
      saveSelectedAccount('')
      return
    }

    if (!nextAccounts.some(account => account.id === selectedAccountId)) {
      const nextId = nextAccounts[0].id
      setSelectedAccountId(nextId)
      saveSelectedAccount(nextId)
    }
  }

  const selectAccount = (id) => {
    setSelectedAccountId(id)
    saveSelectedAccount(id)
    toast.success('Account selected')
  }

  const handleJourneysSave = (nextJourneys) => {
    setJourneys(nextJourneys)
    saveJourneys(nextJourneys)
    const validIds = new Set(nextJourneys.map(journey => String(journey.id)))
    setSelectedJourneyIds(prev => prev.filter(id => validIds.has(String(id))))
  }

  const startAutomation = async (selectedIds = []) => {
    const selectedIdSet = new Set(selectedIds.map(String))
    const journeysToAutomate = journeys.filter(journey => selectedIdSet.has(String(journey.id)))
    const account = accounts.find(item => String(item.id) === String(selectedAccountId))

    if (!account) {
      toast.error('Please select an IRCTC account first.')
      return
    }

    if (!account.password) {
      toast.error('This account has no password saved. Edit it and save the password.')
      return
    }

    if (journeys.length === 0) {
      toast.error('No journeys available to run.')
      return
    }

    if (journeysToAutomate.length === 0) {
      toast.error('Select at least one journey to automate.')
      return
    }

    // Keep the existing execution business logic: credentials are registered
    // for the active runner session immediately before jobs are created.
    try {
      const credentialResponse = await fetch(API + '/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName: account.username.trim(),
          password: account.password,
        }),
      })

      let credentialData = {}
      try {
        credentialData = await credentialResponse.json()
      } catch {
        // handled by status below
      }

      if (!credentialResponse.ok) {
        throw new Error(credentialData.error || 'Failed to register credentials')
      }
    } catch (err) {
      toast.error('Credential Error: ' + err.message)
      return
    }

    const newJobIds = []
    let started = 0

    for (const journey of journeysToAutomate) {
      const payload = {
        credentialsReference: account.username,
        source: String(journey.source || '').toUpperCase(),
        destination: String(journey.destination || '').toUpperCase(),
        travelDate: journey.travelDate || '',
        entrySurface: journey.entrySurface || 'AUTO',
        quota: journey.quota,
        trainNumber: journey.trainNumber || undefined,
        preferredTrains: Array.isArray(journey.preferredTrains) ? journey.preferredTrains : [],
        backupTrains: Array.isArray(journey.backupTrains) ? journey.backupTrains : [],
        trainSelectionPolicy: journey.trainSelectionPolicy || 'FIRST_VALID',
        availabilityRequirement: journey.availabilityRequirement || 'AVAILABLE',
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
        browser: journey.browser || 'edge',
        fastMode: journey.fastMode !== false,
        debugMode: Boolean(journey.debugMode),
      }

      try {
        const res = await fetch(API + '/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        let data = {}
        try {
          data = await res.json()
        } catch {
          // handled by status below
        }

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
            selectedJourneyIds={selectedJourneyIds}
            onSelectionChange={setSelectedJourneyIds}
            activeJobsCount={activeJobs.length}
            onOpenDialog={() => setShowAutomationDialog(true)}
          />
        )}

        {tab === 'accounts' && (
          <AccountsTab
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            onSave={handleAccountsSave}
            onSelect={selectAccount}
          />
        )}

        {tab === 'journeys' && (
          <JourneysTab journeys={journeys} onSave={handleJourneysSave} />
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
        IRCTC Automation Client © {new Date().getFullYear()} — browser-local account data
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
