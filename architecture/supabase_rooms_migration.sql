-- Migration Script: Private Rooms (Ligas Privadas) with Pix Entry Fees

-- 1. Create public.rooms table
CREATE TABLE IF NOT EXISTS public.rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    entry_fee numeric(10, 2) DEFAULT 0.00 NOT NULL,
    created_by uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- 2. Create public.room_matches table
CREATE TABLE IF NOT EXISTS public.room_matches (
    room_id uuid REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
    match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE NOT NULL,
    PRIMARY KEY (room_id, match_id)
);

-- 3. Create public.room_participants table
CREATE TABLE IF NOT EXISTS public.room_participants (
    room_id uuid REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    payment_status text DEFAULT 'paid' NOT NULL, -- 'pending' or 'paid'
    created_at timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (room_id, user_id),
    CONSTRAINT chk_payment_status CHECK (payment_status IN ('pending', 'paid'))
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for public.rooms
CREATE POLICY "Users can view rooms they are members of"
    ON public.rooms
    FOR SELECT
    TO authenticated
    USING (
        id IN (
            SELECT room_id 
            FROM public.room_participants 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Creators can view their rooms"
    ON public.rooms
    FOR SELECT
    TO authenticated
    USING (auth.uid() = created_by);

CREATE POLICY "Authenticated users can create rooms"
    ON public.rooms
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Room creators can update their rooms"
    ON public.rooms
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

-- 5. RLS Policies for public.room_participants
CREATE POLICY "Authenticated users can see room participants"
    ON public.room_participants
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can join rooms"
    ON public.room_participants
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave rooms or creators can remove members"
    ON public.room_participants
    FOR DELETE
    TO authenticated
    USING (
        auth.uid() = user_id 
        OR auth.uid() = (SELECT created_by FROM public.rooms WHERE id = room_id)
    );

CREATE POLICY "Users can update their own status or creator can update it"
    ON public.room_participants
    FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = user_id
        OR auth.uid() = (SELECT created_by FROM public.rooms WHERE id = room_id)
    )
    WITH CHECK (
        auth.uid() = user_id
        OR auth.uid() = (SELECT created_by FROM public.rooms WHERE id = room_id)
    );

-- 6. RLS Policies for public.room_matches
CREATE POLICY "Authenticated users can see room matches"
    ON public.room_matches
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Room creators can link matches to rooms"
    ON public.room_matches
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.rooms 
            WHERE id = room_id 
            AND created_by = auth.uid()
        )
    );
