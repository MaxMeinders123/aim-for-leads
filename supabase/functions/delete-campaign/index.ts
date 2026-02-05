import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get the authenticated user
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const { campaign_id } = await req.json();

    if (!campaign_id) {
      return new Response(JSON.stringify({ error: 'campaign_id is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Verify the campaign belongs to the user
    const { data: campaign, error: campaignError } = await supabaseClient
      .from('campaigns')
      .select('id, user_id')
      .eq('id', campaign_id)
      .single();

    if (campaignError || !campaign) {
      return new Response(JSON.stringify({ error: 'Campaign not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    if (campaign.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized to delete this campaign' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    // Delete related data in order (due to foreign key constraints)
    // 1. Get company_research IDs first for nested deletes
    const { data: companyResearchRecords } = await supabaseClient
      .from('company_research')
      .select('id')
      .eq('campaign_id', campaign_id);

    const companyResearchIds = companyResearchRecords?.map((r: { id: string }) => r.id) || [];

    // 2. Delete prospect_research records linked to company_research
    if (companyResearchIds.length > 0) {
      await supabaseClient
        .from('prospect_research')
        .delete()
        .in('company_research_id', companyResearchIds);
    }

    // 3. Delete company_research records
    await supabaseClient
      .from('company_research')
      .delete()
      .eq('campaign_id', campaign_id);

    // 4. Delete contacts
    await supabaseClient
      .from('contacts')
      .delete()
      .eq('campaign_id', campaign_id);

    // 5. Delete companies
    await supabaseClient
      .from('companies')
      .delete()
      .eq('campaign_id', campaign_id);

    // 6. Finally, delete the campaign itself
    const { error: deleteCampaignError } = await supabaseClient
      .from('campaigns')
      .delete()
      .eq('id', campaign_id)
      .eq('user_id', user.id);

    if (deleteCampaignError) {
      console.error('Error deleting campaign:', deleteCampaignError);
      return new Response(JSON.stringify({ error: 'Failed to delete campaign', details: deleteCampaignError }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Campaign deleted successfully' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in delete-campaign function:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
