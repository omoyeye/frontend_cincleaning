import React from 'react';
import {
  Sparkles,
  Trash2,
  Home,
  Hotel,
  Building2,
  Droplets
} from 'lucide-react';
import { ServiceConfig, Extra } from './types';

export const SERVICES: Partial<ServiceConfig>[] = [
  {
    id: 'general',
    name: 'General/Standard Cleaning',
    baseRate: 20,
    minDuration: 2,
    minNotice: 2,
    // @ts-ignore
    icon: <Home className="w-6 h-6" />,
    description: 'Perfect for regular maintenance of your home.',
    active: true
  },
  {
    id: 'deep',
    name: 'Deep Cleaning',
    baseRate: 30,
    minDuration: 3,
    minNotice: 3,
    // @ts-ignore
    icon: <Sparkles className="w-6 h-6" />,
    description: 'A thorough scrub of every nook and cranny.',
    active: true
  },
  {
    id: 'end_of_tenancy',
    name: 'End of Tenancy Cleaning',
    baseRate: 30,
    minDuration: 3,
    minNotice: 5,
    // @ts-ignore
    icon: <Trash2 className="w-6 h-6" />,
    description: 'Essential for getting your deposit back.',
    active: true
  },
  {
    id: 'airbnb',
    name: 'AirBnB Cleaning',
    baseRate: 20,
    minDuration: 1,
    minNotice: 1,
    // @ts-ignore
    icon: <Hotel className="w-6 h-6" />,
    description: 'Quick turnovers and professional staging.',
    active: true
  },
  {
    id: 'commercial',
    name: 'Commercial Cleaning',
    baseRate: 25,
    minDuration: 2,
    minNotice: 2,
    // @ts-ignore
    icon: <Building2 className="w-6 h-6" />,
    description: 'Office and business premises specialist cleaning.',
    active: true
  },
  {
    id: 'jet_washing',
    name: 'Jet Washing',
    baseRate: 30,
    minDuration: 2,
    minNotice: 2,
    // @ts-ignore
    icon: <Droplets className="w-6 h-6" />,
    description: 'Driveways, patios, and garden surfaces.',
    active: true
  }
];

export const EXTRAS: Extra[] = [
  { id: 'oven', name: 'Oven Cleaning', price: 45, type: 'fixed', duration: 60 },
  { id: 'fridge', name: 'Fridge/Freezer', price: 25, type: 'fixed', duration: 30 },
  { id: 'windows', name: 'Interior Windows', price: 30, type: 'fixed', duration: 30 },
  { id: 'cabinets', name: 'Inside Cabinets', price: 40, type: 'fixed', duration: 30 },
  { id: 'balcony', name: 'Balcony Cleaning', price: 20, type: 'fixed', duration: 30 },
  { id: 'bedroom', name: 'Bedroom', price: 20, type: 'hourly', duration: 60 },
  { id: 'bathroom', name: 'Bathroom', price: 25, type: 'hourly', duration: 60 },
  { id: 'cloakroom', name: 'Cloakroom Toilet', price: 15, type: 'fixed', duration: 30 },
  { id: 'reception', name: 'Reception Room', price: 25, type: 'hourly', duration: 60 },
  { id: 'kitchen', name: 'Kitchen', price: 25, type: 'hourly', duration: 60 },
  { id: 'utility', name: 'Utility Room', price: 15, type: 'fixed', duration: 30 },
  { id: 'carpet', name: 'Carpet Cleaning', price: 35, type: 'hourly', duration: 60 },
];

export const BUSINESS_HOURS = {
  open: 8,
  close: 20
};
