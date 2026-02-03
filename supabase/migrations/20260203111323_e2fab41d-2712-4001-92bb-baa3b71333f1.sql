-- Create profiles table for user info
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_integrations table for webhook URLs
CREATE TABLE public.user_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  n8n_webhook_url TEXT,
  clay_webhook_url TEXT,
  dark_mode BOOLEAN DEFAULT false,
  sound_effects BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create campaigns table
CREATE TABLE public.campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_region TEXT,
  product TEXT,
  product_category TEXT,
  technical_focus TEXT,
  job_titles TEXT,
  personas TEXT,
  target_verticals TEXT,
  primary_angle TEXT,
  secondary_angle TEXT,
  pain_points TEXT,
  companies_count INTEGER DEFAULT 0,
  contacts_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create companies table
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website TEXT,
  linkedin_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create contacts table
CREATE TABLE public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  company_name TEXT,
  name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  phone TEXT,
  linkedin_url TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- User integrations policies
CREATE POLICY "Users can view their own integrations"
  ON public.user_integrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own integrations"
  ON public.user_integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own integrations"
  ON public.user_integrations FOR UPDATE
  USING (auth.uid() = user_id);

-- Campaigns policies
CREATE POLICY "Users can view their own campaigns"
  ON public.campaigns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own campaigns"
  ON public.campaigns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own campaigns"
  ON public.campaigns FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own campaigns"
  ON public.campaigns FOR DELETE
  USING (auth.uid() = user_id);

-- Companies policies (through campaign ownership)
CREATE POLICY "Users can view companies in their campaigns"
  ON public.companies FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.campaigns 
    WHERE campaigns.id = companies.campaign_id 
    AND campaigns.user_id = auth.uid()
  ));

CREATE POLICY "Users can create companies in their campaigns"
  ON public.companies FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaigns 
    WHERE campaigns.id = campaign_id 
    AND campaigns.user_id = auth.uid()
  ));

CREATE POLICY "Users can update companies in their campaigns"
  ON public.companies FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.campaigns 
    WHERE campaigns.id = companies.campaign_id 
    AND campaigns.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete companies in their campaigns"
  ON public.companies FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.campaigns 
    WHERE campaigns.id = companies.campaign_id 
    AND campaigns.user_id = auth.uid()
  ));

-- Contacts policies (through campaign ownership)
CREATE POLICY "Users can view contacts in their campaigns"
  ON public.contacts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.campaigns 
    WHERE campaigns.id = contacts.campaign_id 
    AND campaigns.user_id = auth.uid()
  ));

CREATE POLICY "Users can create contacts in their campaigns"
  ON public.contacts FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaigns 
    WHERE campaigns.id = campaign_id 
    AND campaigns.user_id = auth.uid()
  ));

CREATE POLICY "Users can update contacts in their campaigns"
  ON public.contacts FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.campaigns 
    WHERE campaigns.id = contacts.campaign_id 
    AND campaigns.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete contacts in their campaigns"
  ON public.contacts FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.campaigns 
    WHERE campaigns.id = contacts.campaign_id 
    AND campaigns.user_id = auth.uid()
  ));

-- Create function to handle profile/integrations creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'name', NEW.email);
  
  INSERT INTO public.user_integrations (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_integrations_updated_at
  BEFORE UPDATE ON public.user_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();