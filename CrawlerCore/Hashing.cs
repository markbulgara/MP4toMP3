namespace CrawlerCore;

public static class Hashing
{
    public static ulong XxHash64(string input)
    {
        const ulong prime1 = 11400714785074694791ul;
        const ulong prime2 = 14029467366897019727ul;
        const ulong prime3 = 1609587929392839161ul;
        const ulong prime4 = 9650029242287828579ul;
        const ulong prime5 = 2870177450012600261ul;

        var data = System.Text.Encoding.UTF8.GetBytes(input);
        int len = data.Length;
        int index = 0;
        ulong hash;

        if (len >= 32)
        {
            ulong v1 = prime1 + prime2;
            ulong v2 = prime2;
            ulong v3 = 0;
            ulong v4 = unchecked(0ul - prime1);

            while (index <= len - 32)
            {
                v1 = Round(v1, BitConverter.ToUInt64(data, index));
                index += 8;
                v2 = Round(v2, BitConverter.ToUInt64(data, index));
                index += 8;
                v3 = Round(v3, BitConverter.ToUInt64(data, index));
                index += 8;
                v4 = Round(v4, BitConverter.ToUInt64(data, index));
                index += 8;
            }

            hash = RotateLeft(v1, 1) + RotateLeft(v2, 7) + RotateLeft(v3, 12) + RotateLeft(v4, 18);
            hash = MergeRound(hash, v1);
            hash = MergeRound(hash, v2);
            hash = MergeRound(hash, v3);
            hash = MergeRound(hash, v4);
        }
        else
        {
            hash = prime5;
        }

        hash += (ulong)len;

        while (index <= len - 8)
        {
            ulong k1 = Round(0, BitConverter.ToUInt64(data, index));
            hash ^= k1;
            hash = RotateLeft(hash, 27) * prime1 + prime4;
            index += 8;
        }

        if (index <= len - 4)
        {
            hash ^= (ulong)BitConverter.ToUInt32(data, index) * prime1;
            hash = RotateLeft(hash, 23) * prime2 + prime3;
            index += 4;
        }

        while (index < len)
        {
            hash ^= data[index] * prime5;
            hash = RotateLeft(hash, 11) * prime1;
            index++;
        }

        hash ^= hash >> 33;
        hash *= prime2;
        hash ^= hash >> 29;
        hash *= prime3;
        hash ^= hash >> 32;
        return hash;
    }

    private static ulong Round(ulong acc, ulong input)
    {
        const ulong prime1 = 11400714785074694791ul;
        const ulong prime2 = 14029467366897019727ul;
        acc += input * prime2;
        acc = RotateLeft(acc, 31);
        acc *= prime1;
        return acc;
    }

    private static ulong MergeRound(ulong acc, ulong val)
    {
        const ulong prime1 = 11400714785074694791ul;
        const ulong prime4 = 9650029242287828579ul;
        acc ^= Round(0, val);
        acc = acc * prime1 + prime4;
        return acc;
    }

    private static ulong RotateLeft(ulong value, int shift) => (value << shift) | (value >> (64 - shift));
}

public sealed class BloomFilter
{
    private readonly ulong[] _bits;
    private readonly int _mask;

    public BloomFilter(int sizePowerOfTwo = 1 << 24)
    {
        var length = NextPowerOfTwo(sizePowerOfTwo);
        _bits = new ulong[length / 64];
        _mask = length - 1;
    }

    public void Add(ulong hash)
    {
        SetBit(hash);
        SetBit(hash * 0x9E3779B185EBCA87ul);
        SetBit(hash ^ 0xD6E8FEB86659FD93ul);
    }

    public bool MightContain(ulong hash)
    {
        return GetBit(hash) && GetBit(hash * 0x9E3779B185EBCA87ul) && GetBit(hash ^ 0xD6E8FEB86659FD93ul);
    }

    private void SetBit(ulong hash)
    {
        var bit = (int)(hash & (ulong)_mask);
        var index = bit >> 6;
        var mask = 1ul << (bit & 63);
        _bits[index] |= mask;
    }

    private bool GetBit(ulong hash)
    {
        var bit = (int)(hash & (ulong)_mask);
        var index = bit >> 6;
        var mask = 1ul << (bit & 63);
        return (_bits[index] & mask) != 0;
    }

    private static int NextPowerOfTwo(int value)
    {
        int power = 1;
        while (power < value)
        {
            power <<= 1;
        }
        return power;
    }
}
