import React from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, FormControl,
  Grid, IconButton, InputLabel, MenuItem, Paper, Select, Stack,
  TextField, Typography
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import dayjs from 'dayjs'
import StationAutocomplete from './StationAutocomplete'
import TrainSelector from './TrainSelector'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(customParseFormat)

const CLASSES = ['1A', '2A', '3A', '3E', 'CC', 'SL', '2S', 'FC']
const QUOTAS = [
  { value: 'GENERAL', label: 'GENERAL' },
  { value: 'TATKAL', label: 'TATKAL' },
  { value: 'PREMIUM_TATKAL', label: 'PREMIUM TATKAL' },
]

export default function JourneyEditor({ initialData, onSave, onCancel }) {
  const defaultVals = initialData
    ? Object.assign({}, initialData, {
        travelDate: initialData.travelDate
          ? dayjs(initialData.travelDate, 'DD/MM/YYYY')
          : null,
      })
    : {
        source: '',
        destination: '',
        entrySurface: 'AUTO',
        travelDate: null,
        quota: 'GENERAL',
        trainNumber: '',
        manualTrainNumber: '',
        trainSelectionPolicy: 'FIRST_VALID',
        preferredTrains: [],
        backupTrains: [],
        availabilityRequirement: 'AVAILABLE',
        coach: '3A',
        boardingStation: '',
        passengers: [{
          name: '',
          age: '',
          gender: 'Male',
          berth: 'No Preference',
          food: 'No Food',
        }],
        upiId: '',
        executionMode: 'NOW',
        isMock: false,
      }

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm({ defaultValues: defaultVals })

  const { fields: passengers, append, remove } = useFieldArray({
    control,
    name: 'passengers',
  })

  const swapStations = () => {
    const from = watch('source')
    const to = watch('destination')
    setValue('source', to)
    setValue('destination', from)
  }

  const submitHandler = (data) => {
    const csv = value => {
      if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean)
      return String(value || '').split(',').map(v => v.trim()).filter(Boolean)
    }

    onSave(Object.assign({}, data, {
      travelDate: data.travelDate ? dayjs(data.travelDate).format('DD/MM/YYYY') : '',
      entrySurface: String(data.entrySurface || 'AUTO').toUpperCase(),
      trainSelectionPolicy: String(data.trainSelectionPolicy || 'FIRST_VALID').toUpperCase(),
      preferredTrains: csv(data.preferredTrains),
      backupTrains: csv(data.backupTrains),
      id: initialData && initialData.id ? initialData.id : Date.now().toString(),
      manualTrainNumber: undefined,
    }))
  }

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, minWidth: 0 }}>
      <Typography variant="h6" color="primary" sx={{ mb: 2, fontWeight: 'bold', fontSize: { xs: '1rem', sm: '1.1rem' } }}>
        {initialData ? 'EDIT JOURNEY' : 'NEW JOURNEY'}
      </Typography>

      <form onSubmit={handleSubmit(submitHandler)}>
        <Grid container spacing={{ xs: 1.25, sm: 2 }} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={3}>
            <Controller name="source" control={control} rules={{ required: 'Required' }} render={({ field }) => (
              <TextField {...field} label="From" fullWidth error={!!errors.source} placeholder="NDLS" />
            )} />
          </Grid>
          <Grid item xs={12} sm={1} sx={{ display: 'flex', justifyContent: { xs: 'flex-start', sm: 'center' } }}>
            <IconButton onClick={swapStations} color="primary" size="small" aria-label="Swap stations">
              <SwapHorizIcon />
            </IconButton>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Controller name="destination" control={control} rules={{ required: 'Required' }} render={({ field }) => (
              <TextField {...field} label="To" fullWidth error={!!errors.destination} placeholder="MMCT" />
            )} />
          </Grid>
          <Grid item xs={12} sm={5}>
            <Controller name="travelDate" control={control} rules={{ required: 'Required' }} render={({ field }) => (
              <DatePicker
                {...field}
                label="Journey Date"
                format="DD/MM/YYYY"
                slotProps={{ textField: { fullWidth: true, error: !!errors.travelDate } }}
              />
            )} />
          </Grid>

          <Grid item xs={12} sm={6}>
            <Controller name="entrySurface" control={control} render={({ field }) => (
              <FormControl fullWidth>
                <InputLabel>IRCTC Website</InputLabel>
                <Select {...field} label="IRCTC Website">
                  <MenuItem value="AUTO">Auto — detect runtime</MenuItem>
                  <MenuItem value="NEW">New IRCTC — /eticket/</MenuItem>
                  <MenuItem value="LEGACY">Legacy IRCTC — /nget/train-search</MenuItem>
                </Select>
              </FormControl>
            )} />
          </Grid>

          <Grid item xs={12} sm={3}>
            <Controller name="trainSelectionPolicy" control={control} render={({ field }) => (
              <FormControl fullWidth>
                <InputLabel>Train Selection</InputLabel>
                <Select {...field} label="Train Selection">
                  <MenuItem value="FIXED">Fixed Train</MenuItem>
                  <MenuItem value="FIRST_VALID">First Valid</MenuItem>
                </Select>
              </FormControl>
            )} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <Controller name="trainNumber" control={control} rules={{
              validate: value => watch('trainSelectionPolicy') !== 'FIXED' || String(value || '').trim() ? true : 'Required for Fixed Train',
            }} render={({ field }) => (
              <TrainSelector
                value={field.value}
                onChange={(trainNumber) => {
                  field.onChange(trainNumber)
                  setValue('trainSelectionPolicy', trainNumber ? 'FIXED' : 'FIRST_VALID')
                }}
                from={watch('source')}
                to={watch('destination')}
                travelDate={watch('travelDate')}
                travelClass={watch('coach')}
              />
            )} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <Controller name="manualTrainNumber" control={control} render={({ field }) => (
              <TextField
                {...field}
                label="Manual Train No"
                fullWidth
                placeholder="5-digit train number"
                onChange={(event) => {
                  const value = event.target.value.replace(/\\D/g, '').slice(0, 5)
                  field.onChange(value)
                  if (value.length === 5) {
                    setValue('trainNumber', value)
                    setValue('trainSelectionPolicy', 'FIXED')
                  }
                }}
                helperText="Fallback when train search is unavailable"
              />
            )} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <Controller name="coach" control={control} render={({ field }) => (
              <FormControl fullWidth>
                <InputLabel>Class</InputLabel>
                <Select {...field} label="Class">
                  {CLASSES.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                </Select>
              </FormControl>
            )} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <Controller name="quota" control={control} render={({ field }) => (
              <FormControl fullWidth>
                <InputLabel>Quota</InputLabel>
                <Select {...field} label="Quota">
                  {QUOTAS.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
                </Select>
              </FormControl>
            )} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <Controller name="availabilityRequirement" control={control} render={({ field }) => (
              <FormControl fullWidth>
                <InputLabel>Availability</InputLabel>
                <Select {...field} label="Availability">
                  <MenuItem value="AVAILABLE">Available</MenuItem>
                  <MenuItem value="RAC">RAC</MenuItem>
                  <MenuItem value="WL">Waitlist</MenuItem>
                  <MenuItem value="ANY">Any</MenuItem>
                </Select>
              </FormControl>
            )} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <Controller name="preferredTrains" control={control} render={({ field }) => (
              <TextField
                value={Array.isArray(field.value) ? field.value.join(', ') : field.value || ''}
                onChange={field.onChange}
                label="Preferred Trains"
                placeholder="12295, 22366"
                fullWidth
              />
            )} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <Controller name="backupTrains" control={control} render={({ field }) => (
              <TextField
                value={Array.isArray(field.value) ? field.value.join(', ') : field.value || ''}
                onChange={field.onChange}
                label="Backup Trains"
                placeholder="Other train numbers"
                fullWidth
              />
            )} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <Controller name="boardingStation" control={control} render={({ field }) => (
              <TextField {...field} label="Boarding (Opt)" fullWidth />
            )} />
          </Grid>
        </Grid>

        <Accordion variant="outlined" disableGutters sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 1 } }}>
            <Typography variant="body2" fontWeight="bold">Passengers ({passengers.length})</Typography>
          </AccordionSummary>

          <AccordionDetails sx={{ px: { xs: 1, sm: 2 }, py: { xs: 1, sm: 2 } }}>
            <Stack spacing={1}>
              {passengers.map((passenger, index) => (
                <Paper key={passenger.id} variant="outlined" sx={{ p: { xs: 1, sm: 1.25 }, minWidth: 0 }}>
                  <Grid container spacing={1} alignItems="center">
                    <Grid item xs={12} sm={5}>
                      <Controller
                        name={'passengers.' + index + '.name'}
                        control={control}
                        rules={{ required: true }}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            label="Name"
                            fullWidth
                            error={!!errors.passengers?.[index]?.name}
                          />
                        )}
                      />
                    </Grid>

                    <Grid item xs={4} sm={2}>
                      <Controller
                        name={'passengers.' + index + '.age'}
                        control={control}
                        rules={{ required: true }}
                        render={({ field }) => <TextField {...field} label="Age" type="number" fullWidth />}
                      />
                    </Grid>

                    <Grid item xs={8} sm={2}>
                      <Controller
                        name={'passengers.' + index + '.gender'}
                        control={control}
                        render={({ field }) => (
                          <FormControl fullWidth>
                            <InputLabel>Gender</InputLabel>
                            <Select {...field} label="Gender">
                              <MenuItem value="Male">Male</MenuItem>
                              <MenuItem value="Female">Female</MenuItem>
                              <MenuItem value="Transgender">Transgender</MenuItem>
                            </Select>
                          </FormControl>
                        )}
                      />
                    </Grid>

                    <Grid item xs={10} sm={2}>
                      <Controller
                        name={'passengers.' + index + '.berth'}
                        control={control}
                        render={({ field }) => (
                          <FormControl fullWidth>
                            <InputLabel>Berth</InputLabel>
                            <Select {...field} label="Berth">
                              <MenuItem value="No Preference">No Preference</MenuItem>
                              <MenuItem value="Lower">Lower</MenuItem>
                              <MenuItem value="Middle">Middle</MenuItem>
                              <MenuItem value="Upper">Upper</MenuItem>
                              <MenuItem value="Side Lower">Side Lower</MenuItem>
                              <MenuItem value="Side Upper">Side Upper</MenuItem>
                            </Select>
                          </FormControl>
                        )}
                      />
                    </Grid>

                    <Grid item xs={2} sm={1} sx={{ display: 'flex', justifyContent: 'center' }}>
                      {passengers.length > 1 && (
                        <IconButton size="small" color="error" onClick={() => remove(index)} aria-label="Remove passenger">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Grid>
                  </Grid>
                </Paper>
              ))}
            </Stack>

            <Button
              startIcon={<AddIcon />}
              onClick={() => append({
                name: '',
                age: '',
                gender: 'Male',
                berth: 'No Preference',
                food: 'No Food',
              })}
              size="small"
              sx={{ mt: 1, width: { xs: '100%', sm: 'auto' } }}
            >
              Add Passenger
            </Button>
          </AccordionDetails>
        </Accordion>

        <Accordion variant="outlined" disableGutters sx={{ mb: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 1 } }}>
            <Typography variant="body2" fontWeight="bold">Payment & Options</Typography>
          </AccordionSummary>

          <AccordionDetails sx={{ px: { xs: 1, sm: 2 }, py: { xs: 1, sm: 2 } }}>
            <Grid container spacing={{ xs: 1.25, sm: 2 }}>
              <Grid item xs={12} sm={6}>
                <Controller
                  name="upiId"
                  control={control}
                  rules={{
                    required: 'UPI ID required',
                    pattern: /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.]+$/,
                  }}
                  render={({ field }) => (
                    <TextField {...field} label="UPI ID" fullWidth error={!!errors.upiId} />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="executionMode"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth>
                      <InputLabel>Mode</InputLabel>
                      <Select {...field} label="Mode">
                        <MenuItem value="NOW">Run Now</MenuItem>
                        <MenuItem value="SCHEDULED">Schedule for Later</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        <Box sx={{
          display: 'flex',
          gap: 1,
          justifyContent: { xs: 'stretch', sm: 'flex-end' },
          flexWrap: 'wrap',
        }}>
          <Button variant="outlined" onClick={onCancel} sx={{ flex: { xs: 1, sm: 'none' }, minWidth: 110 }}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" color="secondary" sx={{ flex: { xs: 1, sm: 'none' }, minWidth: 110 }}>
            Save Journey
          </Button>
        </Box>
      </form>
    </Box>
  )
}
