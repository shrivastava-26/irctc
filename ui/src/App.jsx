import React, { useEffect, useState } from 'react'
import { Box, Container } from '@mui/material'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

import Header from './components/Header'
import BookTab from './components/BookTab'
import AccountsTab from './components/AccountsTab'
import JourneysTab from './components/JourneysTab'
import JobsTab from './components/JobsTab'
import {
  buildJob,
  loadAccounts,
  loadJobs,
  loadJourneys,
  loadSelectedAccount,
  saveAccounts,
  saveJobs,
  saveJourneys,
  saveSelectedAccount,
} from './storage'

export default function App() {
  const [tab, setTab] = useState('book')
  const [accounts, setAccounts] = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [journeys, setJourneys] = useState([])
  const [jobs, setJobs] = useState([])

  useEffect(() => {
    const loadedAccounts = loadAccounts().map(account => ({
      ...account,
      id: String(account.id),
      password: account.password || '',
    }))
    const loadedJourneys = loadJourneys()
    const loadedJobs = loadJobs()

    setAccounts(loadedAccounts)
    setJourneys(loadedJourneys)
    setJobs(loadedJobs)

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
  }

  const startAutomation = () => {
    const account = accounts.find(item => item.id === selectedAccountId)

    if (!account) {
      toast.error('Please add/select an IRCTC account first.')
      return
    }

    if (!account.password) {
      toast.error('This account has no password saved. Edit it and save the password.')
      return
    }

    if (journeys.length === 0) {
      toast.error('No journeys available to prepare.')
      return
    }

    const newJobs = journeys.map(journey => buildJob(account, journey))
    const nextJobs = jobs.concat(newJobs)

    setJobs(nextJobs)
    saveJobs(nextJobs)

    toast.success(
      newJobs.length === 1
        ? 'Automation job saved locally'
        : newJobs.length + ' automation jobs saved locally',
    )
    setTab('jobs')
  }

  const saveJobList = (nextJobs) => {
    setJobs(nextJobs)
    saveJobs(nextJobs)
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
            activeJobsCount={jobs.filter(job => job.status === 'READY').length}
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

        {tab === 'jobs' && (
          <JobsTab jobs={jobs} onSave={saveJobList} />
        )}
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
        IRCTC Automation MVP © {new Date().getFullYear()} — browser-local data
      </Box>

      <ToastContainer
        position="bottom-right"
        autoClose={3000}
        hideProgressBar
        theme="colored"
        limit={3}
      />
    </Box>
  )
}
